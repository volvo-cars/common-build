import _ from "lodash"
import { Refs } from "../../domain-model/refs"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Version } from "../../domain-model/version"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { createExecutionSerializer } from "../../system/execution-serializer"
import { ActiveRepositories } from "../../system/queue/active-repositories"
import { JsonUtils } from "../../utils/json-utils"
import { DependencyStorage } from "../dependency-manager/dependency-storage"
import { Content } from "../repository-access/repository-access"
import { RepositoryAccessFactory } from "../repository-access/repository-access-factory"
import { RepositoryFactory } from "../repository/repository-factory"
import { DependencyGraphImpl } from "./dependency-graph-impl"
import { DependencyMapUtils } from "./dependency-map-utils"
import { DependencyProvider, DependencyProviderFactory, DependencyProviderImpl } from "./dependency-provider"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { LabelCriteria } from "./label-criteria"
import { Scanner } from "./scanner"
import { ArtifactoryFactory } from "../../artifact-storage/artifactory/artifactory-factory"
import { PublicationRepositoryMetaDataKeys } from "../publisher/publisher-manager"
import { DependencyLookupProvider, DependencyLookupProviderFactory } from "./dependency-lookup-provider"
export interface ScannerManager {
    processForDependencies(...dependencies: DependencyRef.Ref[]): Promise<RepositorySource[]>
    allDependencies(source: RepositorySource, ref: Refs.ShaRef): Promise<DependencyGraph>
}

export interface DependencyGraph {
    getProblems(): DependencyGraphProblem.Problem[]
    traverse(visitor: (ref: DependencyRef.Ref, version: Version, depth: number) => void): void
}

export namespace DependencyGraphProblem {
    export enum Type {
        MULTIPLE_VERSIONS = "multiple_versions"
    }
    export interface Problem {
        type: Type
        asString(): string
    }

    export interface MultipleVersions extends Problem {
        readonly ref: DependencyRef.Ref
        readonly versions: Version[]
    }
}
export class GraphTree {
    constructor(readonly ref: DependencyRef.Ref, readonly version: Version, readonly dependencies: GraphTree[]) { }
}

const logger = createLogger(loggerName(__filename))

export class ScannerManagerImpl implements ScannerManager {
    private static DEPENDENCY_CACHE_TTL = 10 * 24 * 60

    private executionSerializer = createExecutionSerializer()
    constructor(
        private repositoryAccessFactory: RepositoryAccessFactory,
        private repositoryModelFactory: RepositoryFactory,
        private activeRepositories: ActiveRepositories,
        private scanner: Scanner,
        private dependencyStorage: DependencyStorage,
        private dependencyLookupProviderFactory: DependencyLookupProviderFactory,
        private redisFactory: RedisFactory,
        private artifactoryFactory: ArtifactoryFactory
    ) { }

    async allDependencies(source: RepositorySource, ref: Refs.Ref): Promise<DependencyGraph> {
        const graphs = await this.repositoryDependencies(source, ref)
        return new DependencyGraphImpl(graphs)
    }

    private repositoryDependencies(source: RepositorySource, ref: Refs.Ref): Promise<GraphTree[]> {
        return this.redisFactory.get().then(async client => {
            const key = `dependencye-cache:${source.id}:${source.path}:${ref.name}`
            const cached = await client.get(key)
            const dependencyMap = cached ? DependencyMapUtils.fromObject(JsonUtils.parse(cached)) : await this.scanner.dependencies(source, ref)
            if (!cached) {
                await client.set(key, JsonUtils.stringify(DependencyMapUtils.toObject(dependencyMap)), "EX", ScannerManagerImpl.DEPENDENCY_CACHE_TTL)
            }

            const resolveGraphs = async (ref: DependencyRef.Ref, versions: Version[]): Promise<GraphTree[]> => {
                logger.debug(`Resolving dependencies for ${ref.toString()}/${versions.join(", ")}`)
                if (ref instanceof DependencyRef.GitRef) {

                    const modelReader = await this.repositoryModelFactory.get(ref.source).modelReader()
                    const versionShas: [Version, Refs.ShaRef][] = versions.flatMap(version => {
                        const resolvedSha = modelReader.versionSha(version)
                        if (resolvedSha) {
                            return [[version, resolvedSha]]
                        } else {
                            return []
                        }
                    })

                    return Promise.all(versionShas.map(async ([version, shaRef]) => {
                        return this.repositoryDependencies(ref.source, shaRef).then(subTrees => {
                            return new GraphTree(ref, version, subTrees)
                        })
                    }))
                } else if (ref instanceof DependencyRef.ArtifactRef) {
                    return Promise.all(versions.map(version => {
                        return this.artifactoryFactory.get(ref.remote).getArtifact(ref.repository, ref.path, version.asString()).then(async artifact => {
                            if (artifact) {
                                const rawRepoId = artifact.properties[PublicationRepositoryMetaDataKeys.id]
                                if (rawRepoId) {
                                    try {
                                        const sourceId = RepositorySource.createFromString(rawRepoId)
                                        const transitiveDependencies = await this.repositoryDependencies(sourceId, new Refs.TagRef(`v${version.asString()}`))
                                        return [new GraphTree(ref, version, [new GraphTree(new DependencyRef.GitRef(sourceId), version, transitiveDependencies)])]
                                    } catch {
                                        logger.warn(`Could not re-create RepositorySource and Ref from ${rawRepoId} in ${source.toString()}`)
                                        return [new GraphTree(ref, version, [])]
                                    }
                                } else {
                                    logger.warn(`No binary repository reference(${PublicationRepositoryMetaDataKeys.id}) in ${ref}:${version.asString()}. Skipping binart dependency traversal.`)
                                    return [new GraphTree(ref, version, [])]
                                }
                            } else {
                                logger.warn(`Could not find artifact: ${ref}/${version.asString()} in Artifactory. Dependency not included.`)
                                return []
                            }
                        })
                    })).then(trees => {
                        return trees.flat()
                    })
                } else {
                    return Promise.resolve(versions.map(version => {
                        return new GraphTree(ref, version, [])
                    }))
                }
            }
            return (await Promise.all(Array.from(dependencyMap.entries()).map(([ref, versions]) => {
                return resolveGraphs(ref, versions)
            }))).flat()
        })

    }

    async processForDependencies(...dependencies: DependencyRef.Ref[]): Promise<RepositorySource[]> {
        logger.info(`Processing for dependencies: ${dependencies.join(",")}...`)
        const allRepositories = await this.activeRepositories.activeRepositories()
        const allDependentRepositories = (await this.dependencyStorage.findDependentSources(...dependencies))
        logger.debug(`Dependent repos for: ${dependencies.join(",")}: ${allDependentRepositories.join(",")} `)
        const allUnknownRepositories = _.zip(allRepositories, (await this.dependencyStorage.isKnown(...allRepositories))).flatMap(([source, known]) => {
            if (!known && source) {
                return [source]
            } else {
                return []
            }
        })
        const dependencyLookupProvider = this.dependencyLookupProviderFactory.createProvider()
        const scanRepositories = RepositorySource.unique(_.flatten([allDependentRepositories, allUnknownRepositories]))
        //  console.log("PROCESS FOR", allRepositories, allDependentRepositories, allUnknownRepositories, scanRepositories)
        return Promise.all(scanRepositories.map(source => {
            return this.scanRepository(source, dependencyLookupProvider)
        })).then(() => {
            return scanRepositories
        })
    }

    private async scanRepository(source: RepositorySource, dependencyLookupProvider: DependencyLookupProvider): Promise<void> {
        const cmd = async () => {
            logger.info(`Scanning for dependencies: ${source}`)
            const repositoryModelReader = await this.repositoryModelFactory.get(source).modelReader()
            const majorReads = repositoryModelReader.resolveReadShas(1) //Two later on
            const repositoryAccess = this.repositoryAccessFactory.createAccess(source.id)
            const openUpdates = await repositoryAccess.getUpdates(source.path)
            const allDependencies = DependencyRef.uniqueRefs(_.flatten(await Promise.all(majorReads.map(async majorRead => {
                if (majorRead.sha) {
                    const dependencyProvider = new DependencyProviderImpl(majorRead.major, dependencyLookupProvider)
                    const scanResult = await this.scanner.scan(source, majorRead.major, majorRead.sha, dependencyProvider, LabelCriteria.includeAll())
                    const updatesByLabel = _.groupBy(scanResult.updates, dependencyUpdate => {
                        return dependencyUpdate.label
                    })
                    const labels = Object.keys(updatesByLabel)
                    logger.info(`Scanning major:${majorRead.major} in ${source} ${majorRead.sha} Labels:${labels.join(",")}`)

                    await Promise.all(Object.keys(updatesByLabel).map(async label => {
                        const dependencyUpdates = updatesByLabel[label]
                        const writeBranch = repositoryModelReader.resolveWriteBranch(majorRead.major)
                        if (writeBranch) {
                            // Find if existing update exists
                            const existingUpdate = _.find(openUpdates, update => {
                                return _.includes(update.labels, label) && update.target === writeBranch.branch.name
                            })
                            const contents: Content.Content[] = dependencyUpdates.map(update => {
                                return new Content.Text(update.path, update.content)
                            })
                            if (existingUpdate) {
                                logger.info(`Updating existing Update ${source}/${writeBranch.branch.name} (${existingUpdate.id}) (sha:${existingUpdate.sha}) [${label}] (${existingUpdate.labels.join(",")})`)
                                await repositoryAccess.updateUpdate(source.path, existingUpdate.id, ...contents)
                                return Promise.resolve()
                            } else {
                                if (!writeBranch.exists) {
                                    await repositoryAccess.createBranch(source.path, writeBranch.sha, writeBranch.branch.name)
                                }

                                logger.debug(`Creating Update for ${source} major:${majorRead.major} label:${label} files: ${contents.map(c => { return c.path }).join(",")}`)
                                await repositoryAccess.createUpdate(source.path, writeBranch.branch, [label], ...contents)
                                return Promise.resolve()
                            }
                        } else {
                            logger.warn(`Could not resolve write-branch for major ${majorRead.major} in ${source.id}/${source.path}`)
                            return undefined
                        }
                    }))
                    return scanResult.allDependencies
                } else {
                    return Promise.resolve([])
                }
            }))))

            await this.dependencyStorage.setDependencies(source, ...allDependencies)
            return Promise.resolve()
        }
        return this.executionSerializer.execute(`scan-repository:${source.id}/${source.path}`, cmd)

    }


}

