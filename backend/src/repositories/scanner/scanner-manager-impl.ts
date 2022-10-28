import _ from "lodash"
import { ActiveSystem } from "../../active-system/active-system"
import { ArtifactoryFactory } from "../../artifact-storage/artifactory/artifactory-factory"
import { Refs } from "../../domain-model/refs"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { LocalGitCommands } from "../../git/local-git-commands"
import { LocalGitFactory, LocalGitLoadMode } from "../../git/local-git-factory"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { createExecutionSerializer } from "../../system/execution-serializer"
import { ActiveRepositories } from "../../system/queue/active-repositories"
import { SourceCache } from "../../system/source-cache"
import { JsonUtils } from "../../utils/json-utils"
import { DependencyStorage } from "../dependency-manager/dependency-storage"
import { MajorsService } from "../majors/majors-service"
import { PublicationRepositoryMetaDataKeys } from "../publisher/publisher-manager"
import { Content } from "../repository-access/repository-access"
import { RepositoryAccessFactory } from "../repository-access/repository-access-factory"
import { RepositoryFactory } from "../repository/repository-factory"
import { SystemFilesAccess } from "../system-files-access"
import { DependencyGraphImpl } from "./dependency-graph-impl"
import { DependencyLookup } from "./dependency-lookup"
import { DependencyMapUtils } from "./dependency-map-utils"
import { LabelCriteria } from "./label-criteria"
import { Scanner } from "./scanner"
import { ScannerManager } from "./scanner-manager"

export class GraphTree {
    constructor(readonly ref: DependencyRef.Ref, readonly version: Version, readonly dependencies: GraphTree[]) { }
}

const logger = createLogger(loggerName(__filename))
const Const = {
    SCAN_DEPTH: 1,
    SCAN_UPDATES: true
}

export class ScannerManagerImpl implements ScannerManager.Service {
    private static DEPENDENCY_CACHE_TTL = 10 * 24 * 60

    private executionSerializer = createExecutionSerializer()
    constructor(
        private repositoryAccessFactory: RepositoryAccessFactory,
        private repositoryModelFactory: RepositoryFactory,
        private activeRepositories: ActiveRepositories,
        private scanner: Scanner.Service,
        private dependencyStorage: DependencyStorage,
        private dependencyLookupFactory: DependencyLookup.Factory,
        private redisFactory: RedisFactory,
        private artifactoryFactory: ArtifactoryFactory,
        private activeSystem: ActiveSystem.System,
        private majorService: MajorsService,
        private systemFilesAccess: SystemFilesAccess,
        private sourceCache: SourceCache.Service,
    ) { }

    registerDependencies(source: RepositorySource): Promise<void> {
        return this.activeSystem.isActive(source).then(isActive => {
            if (isActive) {
                return this.repositoryModelFactory.get(source).modelReader().then(modelReader => {
                    return this.systemFilesAccess.getRepositoryConfig(source).then(repositoryConfig => {
                        const scanMajor = (major: number): Promise<Map<DependencyRef.Ref, Version[]>> => {
                            const readSha = modelReader.resolveReadSha(major)
                            if (readSha) {
                                return this.scanner.getDependencies(source, readSha)
                            } else {
                                return Promise.resolve(new Map())
                            }
                        }
                        const majorSerie = repositoryConfig?.majorSerie
                        if (majorSerie) {
                            return this.majorService.getValue(majorSerie.id, true).then(serie => {
                                if (serie) {
                                    return Promise.all(_.take(serie.values, Const.SCAN_DEPTH).map(major => {
                                        return scanMajor(major)
                                    }))
                                } else {
                                    return Promise.reject(new Error(`The referred major-serie ${majorSerie.id} doesn't exist in the system.`))
                                }
                            })
                        } else {
                            return Promise.all(modelReader.top(Const.SCAN_DEPTH).map(major => {
                                return scanMajor(major.major)
                            }))
                        }
                    }).then(results => {
                        const allDependencies = Array.from(DependencyMapUtils.merge(...results).keys())
                        return this.dependencyStorage.update(source, ...allDependencies)
                    })
                })
            } else {
                logger.warn(`Can not add dependencies for ${source}. Not active in ${this.activeSystem.systemId}`)
                return Promise.resolve()
            }
        })
    }

    processByReferences(filter: ScannerManager.ProcessFilter, ...refs: DependencyRef.Ref[]): Promise<ScannerManager.ProcessResult[]> {
        return this.dependencyStorage.lookup(...refs).then(allRepositories => {
            const repositories = allRepositories.filter(r => { return filter.include(r) })
            logger.debug(`Processing dependent repos [${repositories.join(",")}] for references ${refs.map(r => { return r.toString() }).join(", ")} `)
            return this.processBySource(...repositories)
        })
    }

    processBySource(...sources: RepositorySource[]): Promise<ScannerManager.ProcessResult[]> {
        const results = sources.map(source => {
            return this.activeSystem.isActive(source).then(isActive => {
                if (isActive) {
                    return this.processRepository(source).then(entries => {
                        return Promise.resolve(new ScannerManager.SuccessfulProcessResult(entries))
                    }).catch((e: Error) => {
                        return Promise.resolve(new ScannerManager.ErrorProcessResult(e))
                    })
                } else {
                    logger.debug(`Process skipped ${source} not active in this environment ${this.activeSystem.systemId}.`)
                    return Promise.resolve(new ScannerManager.ErrorProcessResult(new Error(`Skipped - not active in ${this.activeSystem.systemId}`)))
                }
            })
        })
        return Promise.all(results)
    }

    private processRepository(source: RepositorySource): Promise<ScannerManager.ProcessResultEntry[]> {
        const cmd = () => {
            return this.repositoryModelFactory.get(source).modelReader().then(modelReader => {
                const repositoryAccess = this.repositoryAccessFactory.createAccess(source.id)
                return repositoryAccess.getUpdates(source.path).then(allUpdates => {
                    return this.systemFilesAccess.getRepositoryConfig(source).then(repositoryConfig => {
                        const scanMajor = (major: number, selector: DependencyLookup.DependencySelector): Promise<ScannerManager.ProcessResultEntry[]> => {
                            const readSha = modelReader.resolveReadSha(major)
                            const modelBranch = modelReader.findBranch(major, undefined)
                            const dependencyProvider = this.dependencyLookupFactory.create(selector)
                            if (readSha) {
                                return this.scanner.scan(source, readSha, dependencyProvider, LabelCriteria.includeAll()).then(majorScanResult => {
                                    const allMajorLabels = majorScanResult.updateLabels()
                                    return Promise.all(allMajorLabels.map(majorLabel => {
                                        const existingUpdate = modelBranch ? allUpdates.find(u => { return _.includes(u.labels, majorLabel) && u.target === modelBranch.ref.name }) : undefined
                                        if (existingUpdate) {
                                            return this.sourceCache.ensureRef(source, existingUpdate.sha, existingUpdate.refSpec).then(() => {
                                                return this.scanner.scan(source, existingUpdate.sha, dependencyProvider, LabelCriteria.include([majorLabel])).then(updateScanResult => {
                                                    const contents: Content.Content[] = updateScanResult.dependencyUpdates.map(update => {
                                                        return new Content.Text(update.path, update.content)
                                                    })
                                                    if (contents.length) {
                                                        if (contents.length) {
                                                            logger.debug(`Updating existing change ${existingUpdate}: ${contents.map(s => { return s.path }).join(", ")}`)
                                                        }
                                                        return repositoryAccess.updateUpdate(source.path, existingUpdate.id, ...contents).then(() => {
                                                            return [new ScannerManager.ProcessResultEntry(major, `Updated existing update ${existingUpdate.id} for label ${majorLabel}.`, existingUpdate.id)]
                                                        })
                                                    } else {
                                                        return []
                                                    }
                                                })
                                            })
                                        } else {
                                            const labelUpdates = majorScanResult.updatesByLabel(majorLabel)
                                            if (labelUpdates.length) {

                                                const getOrCreateTargetBranch = (): Promise<Refs.Branch> => {
                                                    const writeBranch = modelReader.resolveWriteBranch(major)
                                                    if (writeBranch) {
                                                        if (writeBranch.exists) {
                                                            return Promise.resolve(new Refs.Branch(writeBranch.branch, writeBranch.sha))
                                                        } else {
                                                            return repositoryAccess.createBranch(source.path, writeBranch.sha, writeBranch.branch.name)
                                                        }
                                                    } else {
                                                        return Promise.reject(new Error(`Could not find write-branch for major: ${major}`))
                                                    }
                                                }
                                                return getOrCreateTargetBranch().then(targetBranch => {
                                                    const contents: Content.Content[] = majorScanResult.updatesByLabel(majorLabel).map(update => {
                                                        return new Content.Text(update.path, update.content)
                                                    })
                                                    return repositoryAccess.createUpdate(source.path, targetBranch.ref, [majorLabel], ...contents).then(createdUpdateId => {
                                                        logger.debug(`Created new change ${createdUpdateId}: ${contents.map(s => { return s.path }).join(", ")}`)

                                                        return [new ScannerManager.ProcessResultEntry(major, `Created new update ${createdUpdateId} for label ${majorLabel}.`, createdUpdateId)]

                                                    })
                                                })
                                            } else {
                                                return Promise.resolve([])
                                            }
                                        }
                                    })).then(labelEntries => {
                                        return labelEntries.flat()
                                    })
                                })
                            } else {
                                return Promise.resolve([new ScannerManager.ProcessResultEntry(major, `Major ${major} doesn't exist.`, undefined)])
                            }
                        }
                        const majorSerie = repositoryConfig?.majorSerie
                        if (majorSerie) {
                            return this.majorService.getValue(majorSerie.id, true).then(serie => {
                                if (serie) {
                                    return Promise.all(_.take(serie.values, Const.SCAN_DEPTH).map((major, index) => {
                                        if (index === 0) {
                                            return scanMajor(major, new DependencyLookup.HighestInMajorOrHighestDependencySelector(major, serie.id))
                                        } else {
                                            return scanMajor(major, new DependencyLookup.HighestInMajorOrKeepMajorDependencySelector(major, serie.id))
                                        }
                                    }))
                                } else {
                                    return Promise.reject(new Error(`The referred major-serie ${majorSerie.id} doesn't exist in the system.`))
                                }
                            })
                        } else {
                            return Promise.all(modelReader.top(Const.SCAN_DEPTH).map((major, index) => {
                                if (index === 0) {
                                    return scanMajor(major.major, DependencyLookup.HighestDependencySelector.INSTANCE)
                                } else {
                                    return scanMajor(major.major, DependencyLookup.HighestMinorKeepMajorDependencySelector.INSTANCE)
                                }
                            }))
                        }
                    }).then(results => {
                        return results.flat()
                    })
                })
            })
        }
        return this.executionSerializer.execute(`dependency-scan:${source.serialize()}`, cmd)
    }




    getDependencyGraph(source: RepositorySource, sha: Refs.ShaRef): Promise<ScannerManager.DependencyGraph> {
        return this.getGraphTrees(source, sha).then(graphs => {
            return new DependencyGraphImpl(graphs)
        })
    }

    private getGraphTrees(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<GraphTree[]> {
        return this.redisFactory.get().then(async client => {
            const key = `dependency-cache:${source.id}:${source.path}:${ref.name}`
            const cached = await client.get(key)
            const dependencyMap = cached ? DependencyMapUtils.fromObject(JsonUtils.parse(cached)) : await this.scanner.getDependencies(source, ref)
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
                        return this.getGraphTrees(ref.source, shaRef).then(subTrees => {
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
                                        const transitiveDependencies = await this.getGraphTrees(sourceId, new Refs.TagRef(`v${version.asString()}`))
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

}

