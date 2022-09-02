import _ from 'lodash'
import { SystemConfig } from "../config/system-config"
import { Refs } from "../domain-model/refs"
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { RepositoryConfig } from '../domain-model/system-config/repository-config'
import { Version } from "../domain-model/version"
import { LocalGitFactory, LocalGitLoadMode } from "../git/local-git-factory"
import { createLogger, loggerName } from "../logging/logging-factory"
import { RedisFactory } from "../redis/redis-factory"
import { PublisherManager } from "../repositories/publisher/publisher-manager"
import { UpdateReceiver } from "../repositories/repository-access/gerrit/gerrit-stream-listener"
import { RepositoryAccessFactory } from "../repositories/repository-access/repository-access-factory"
import { NormalizedModel, NormalizedModelUtil } from "../repositories/repository/normalized-model"
import { VersionType } from "../repositories/repository/repository"
import { RepositoryFactory } from "../repositories/repository/repository-factory"
import { DependencyRef } from "../domain-model/system-config/dependency-ref"
import { ScannerManager } from "../repositories/scanner/scanner-manager"
import { SystemFilesAccess, SystemFilesAccessImpl } from "../repositories/system-files-access"
import { createExecutionSerializer, ExecutionSerializer } from "./execution-serializer"
import { JobExecutor, JobExecutorListener } from "./job-executor/job-executor"
import { JobRef, JobRefType } from "./job-executor/job-ref"
import { ActiveRepositories } from "./queue/active-repositories"
import { BuildState } from "./queue/build-state"
import { buildQueue, Queue, QueueListener, QueueStatus } from "./queue/queue"
import { Time } from "./time"
import { LocalGitCommands } from '../git/local-git-commands'
import { BuildConfig } from '../domain-model/system-config/build-config'

export interface BuildSystem {
    onUpdate(update: Update): Promise<void>
    getStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<QueueStatus | null>
    release(source: RepositorySource, branch: Refs.Branch, versionType: VersionType): Promise<Version>
}

export type UpdateId = string

export type UpdateLabel = string

export type BranchName = string

export class Update {
    constructor(
        public readonly source: RepositorySource,
        public readonly id: UpdateId,
        public readonly sha: Refs.ShaRef,
        public readonly target: BranchName,
        public readonly title: string,
        public readonly labels: UpdateLabel[],
        public readonly changeNumber: number
    ) { }

    toString(): string {
        return `Change ${this.id}/${this.changeNumber} (${this.source}) -> ${this.target} (${this.labels.join(", ")})`
    }

}

export class MetaData { }

const logger = createLogger(loggerName(__filename))

export class BuildSystemImpl implements BuildSystem, QueueListener, JobExecutorListener, UpdateReceiver {
    private queue: Queue
    private executionSerializer: ExecutionSerializer
    private systemFilesAccess: SystemFilesAccess

    constructor(
        redis: RedisFactory,
        time: Time,
        private jobExecutor: JobExecutor,
        private repositoryAcccessFactory: RepositoryAccessFactory,
        private repositoryModelFactory: RepositoryFactory,
        private activeRepositories: ActiveRepositories,
        private publisherManager: PublisherManager,
        private scannerManager: ScannerManager,
        private localGitFactory: LocalGitFactory,
        config: SystemConfig.Engine
    ) {
        this.queue = buildQueue(redis, time, this, config)
        this.systemFilesAccess = new SystemFilesAccessImpl(repositoryAcccessFactory)
        this.executionSerializer = createExecutionSerializer()
        jobExecutor.setListener(this)
    }


    async getStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<QueueStatus | null> {
        return this.queue.getStatus(source, ref, sha).then(maybeBuildState => { return maybeBuildState?.current().status || null })
    }

    onJobStarted(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void {
        this.updateQueue(source, ref, sha, QueueStatus.STARTED)
    }
    onJobError(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void {
        this.updateQueue(source, ref, sha, QueueStatus.ERROR)
    }
    onJobFailure(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void {
        this.updateQueue(source, ref, sha, QueueStatus.FAILURE)
    }
    onJobSuccess(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void {
        if (ref.type === JobRefType.UPDATE) {
            logger.info(`Jobs successful: ${source}/${ref.serialize()} ${sha}`)
            this.systemFilesAccess.getRepositoryConfig(source).then(async repositoryConfig => {
                if (repositoryConfig) {

                    //TODO: Check labels on RepositoryConfig to get the correct action.
                    const publications = <DependencyRef.ArtifactRef[]>(await this.publisherManager.publications(source, sha))
                    await this.publisherManager.addMetaData(source, sha, publications)
                    const repositoryAccess = this.repositoryAcccessFactory.createAccess(source.id)
                    if (ref.type === JobRefType.UPDATE) {
                        await repositoryAccess.setValidBuild(source.id, ref.ref, sha)
                    }
                    const action = repositoryConfig.buildAutomation.default
                    logger.debug(`Job successful action: ${action} (${source}/${ref.serialize()})`)
                    if (action === RepositoryConfig.Action.Merge || action === RepositoryConfig.Action.Release) {
                        repositoryAccess.merge(source.path, ref.ref)
                            .then(async updatedBranch => {
                                logger.info(`Merged ${source}/${ref.serialize()} ${sha}`)
                                return this.updateQueue(source, ref, sha, QueueStatus.SUCCEESS).then(() => {
                                    return updatedBranch
                                })
                            })
                            .then(updatedBranch => {
                                return this.updateQueue(source, ref, sha, QueueStatus.SUCCEESS).then(() => {
                                    if (action === RepositoryConfig.Action.Release) {
                                        return this.release(source, updatedBranch, VersionType.MINOR).then(_ => { return })
                                    } else {
                                        return Promise.resolve()
                                    }
                                })

                            })
                            .catch(error => {
                                logger.error(`Could not merge ${source}/${ref.serialize()} ${sha}:${error}`)
                                return this.updateQueue(source, ref, sha, QueueStatus.FAILURE)
                            })
                    }
                } else {
                    logger.warn(`Missing repository config for ${source}. No action taken.`)
                }
            })



        } else {
            this.updateQueue(source, ref, sha, QueueStatus.SUCCEESS)
        }
    }

    async release(source: RepositorySource, branch: Refs.Branch, versionType: VersionType): Promise<Version> {
        const repositoryModel = this.repositoryModelFactory.get(source)
        const nextVersion = (await repositoryModel.modelReader()).nextVersion(branch.ref, versionType)
        //Clear
        await Promise.all([this.localGitFactory.invalidate(source), this.repositoryModelFactory.get(source).invalidate()])
        const publishedRefs = await this.publisherManager.publications(source, branch.sha)
        await this.publisherManager.publish(publishedRefs, branch.sha, nextVersion)
        logger.debug(`Published binary versions ${nextVersion.asString()}:${publishedRefs.join(",")} from ${source}/${branch.ref.name}`)
        logger.info(`Releasing next version ${nextVersion.asString()} from ${source}/${branch.ref.name}@${branch.sha}`)
        return this.repositoryAcccessFactory.createAccess(source.id).createTag(source.path, branch.sha, `v${nextVersion.asString()}`, `Released by Common-build`).then(tag => {
            return nextVersion
        }).catch(e => {
            logger.error(`Error while creating source tag: ${e}. NOTE: Binaries must be cleaned up.`)
            return Promise.reject(e)
        })
    }

    private updateQueue(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, status: QueueStatus): Promise<void> {
        logger.info(`JobManager->QueueUpdate ${source} ${sha} -> ${status}`)
        return this.queue.addStatus(source, ref, sha, status)
    }

    onQueueUpdated(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, buildState: BuildState): void {
        const cmd = async () => {
            const status = buildState.current().status
            logger.info(`Queue updated: ${source}/${ref.serialize()} ${sha} -> ${status}`)
            if (status === QueueStatus.STARTING) {
                if (ref.type === JobRefType.UPDATE) {
                    this.repositoryAcccessFactory.createAccess(source.id).rebase(source.path, ref.ref)
                        .then(async newSha => {
                            if (newSha) {
                                logger.info(`Rebased update ${ref.serialize()} in ${source} sha: ${sha} -> ${newSha}`)
                                return this.updateQueue(source, ref, sha, QueueStatus.ABORTED) // Will get a new update for the rebase.
                            } else {
                                logger.debug(`No rebase needed for ${ref.serialize()} in ${source} sha: ${sha}`)
                                const dependencyTree = await this.scannerManager.allDependencies(source, sha)
                                const dependencyProblems = dependencyTree.getProblems()

                                const dependencyTreeLog = [`***************** Dependency tree for ${source}/${sha}`]
                                dependencyTree.traverse((ref: DependencyRef.Ref, version: Version, depth: number) => {
                                    dependencyTreeLog.push(`${_.repeat(" ", depth * 3)} ${ref.toString()}: ${version.asString()}`)
                                })
                                dependencyTreeLog.push(`***************** Problem count: ${dependencyProblems.length}`)
                                if (dependencyProblems.length) {
                                    dependencyTreeLog.push(`Dependendency problems with ${source}/${sha}: ${dependencyProblems.map(p => { return p.asString() }).join(", ")}. Signalling dependency issue to queue.`)
                                }
                                console.log(dependencyTreeLog.join("\n"))
                                if (dependencyProblems.length) {
                                    this.updateQueue(source, ref, sha, QueueStatus.DEPENDENCY)
                                } else {
                                    this.jobExecutor.startJob(source, ref, sha)
                                }
                            }
                        })
                        .catch(error => {
                            logger.debug(`Error while rebasing update ${ref.ref} in ${source}: ${error}`)
                            return this.updateQueue(source, ref, sha, QueueStatus.CONFLICT)
                        })
                } else {
                    throw new Error("Not implemented")
                }
            } else if (status === QueueStatus.ABORTED) {
                this.jobExecutor.abortJob(source, ref, sha)
            }
        }
        this.executionSerializer.execute(this.createSourceExecutionKey(source), cmd)
    }


    private createSourceExecutionKey(source: RepositorySource): string {
        return `${source.id}/${source.path}`
    }

    async onUpdate(update: Update): Promise<void> {
        const cmd = async () => {
            logger.debug(`Fetching ${update}`)
            await this.localGitFactory.execute(update.source, LocalGitCommands.fetchUpdate(update), LocalGitLoadMode.CACHED)
            let buildYml = await this.systemFilesAccess.getBuildConfig(update.source, update.sha)
            if (buildYml) {
                this.activeRepositories.addActiveRepositories(update.source)
                return this.queue.upsert(update).then(_ => { return })
            } else {
                logger.debug(`No ${BuildConfig.FILE_PATH} for ${update.source}:${update.sha}. No processing.`)
                return Promise.resolve()
            }
        }
        return this.executionSerializer.execute(this.createSourceExecutionKey(update.source), cmd)
    }

    async onPush(source: RepositorySource, ref: Refs.Ref, newSha: Refs.ShaRef): Promise<void> {
        const cmd = async () => {
            const modelAction = NormalizedModelUtil.normalize(ref) ? this.repositoryModelFactory.get(source).invalidate() : Promise.resolve()
            await Promise.all([this.localGitFactory.invalidate(source), modelAction])
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            if (normalizedRef) {
                if (normalizedRef.type === NormalizedModel.Type.MAIN_BRANCH) {
                    const hasBuildYml = (await this.systemFilesAccess.getBuildConfig(source, newSha)) ? true : false
                    if (hasBuildYml) {
                        this.activeRepositories.addActiveRepositories(source)
                    } else {
                        this.activeRepositories.removeActiveRepositories(source)
                    }
                } else if (normalizedRef.type === NormalizedModel.Type.RELEASE_TAG) {
                    logger.info(`Got release: ${source}/${ref}. Triggering dependency scan.`)
                    const publications = await this.publisherManager.publications(source, newSha)
                    this.scannerManager.processForDependencies(...[[new DependencyRef.GitRef(source)], publications].flat())
                }
            }
            return
        }
        return this.executionSerializer.execute(this.createSourceExecutionKey(source), cmd)
    }

    onDelete(source: RepositorySource, ref: Refs.Ref): Promise<void> {
        const cmd = () => {
            const modelAction = NormalizedModelUtil.normalize(ref) ? this.repositoryModelFactory.get(source).invalidate() : Promise.resolve()
            return Promise.all([this.localGitFactory.invalidate(source), modelAction]).then(() => { })
        }
        return this.executionSerializer.execute(this.createSourceExecutionKey(source), cmd)
    }
}


