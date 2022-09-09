import _ from 'lodash'
import { SystemConfig } from "../config/system-config"
import { Refs } from "../domain-model/refs"
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { BuildConfig } from '../domain-model/system-config/build-config'
import { DependencyRef } from "../domain-model/system-config/dependency-ref"
import { RepositoryConfig } from '../domain-model/system-config/repository-config'
import { Version } from "../domain-model/version"
import { LocalGitCommands } from '../git/local-git-commands'
import { LocalGitFactory, LocalGitLoadMode } from "../git/local-git-factory"
import { createLogger, loggerName } from "../logging/logging-factory"
import { RedisFactory } from "../redis/redis-factory"
import { PublisherManager } from "../repositories/publisher/publisher-manager"
import { UpdateReceiver } from "../repositories/repository-access/gerrit/gerrit-stream-listener"
import { RepositoryAccessFactory } from "../repositories/repository-access/repository-access-factory"
import { NormalizedModel, NormalizedModelUtil } from "../repositories/repository/normalized-model"
import { VersionType } from "../repositories/repository/repository"
import { RepositoryFactory } from "../repositories/repository/repository-factory"
import { ScannerManager } from "../repositories/scanner/scanner-manager"
import { SystemFilesAccess, SystemFilesAccessImpl } from "../repositories/system-files-access"
import { createExecutionSerializer, ExecutionSerializer } from "./execution-serializer"
import { JobExecutor } from './job-executor/job-executor'
import { JobRef, JobRefType } from "./job-executor/job-ref"
import { ActiveRepositories } from "./queue/active-repositories"
import { BuildState } from "./queue/build-state"
import { buildQueue, Queue, QueueListener, QueueStatus } from "./queue/queue"
import { Time } from "./time"

export interface BuildSystem {
    onUpdate(update: Update): Promise<void>
    getStatus(key: JobExecutor.Key): Promise<QueueStatus | null>
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

export class BuildSystemImpl implements BuildSystem, QueueListener, JobExecutor.Listener, UpdateReceiver {
    private queue: Queue
    private executionSerializer: ExecutionSerializer
    private systemFilesAccess: SystemFilesAccess

    constructor(
        private redis: RedisFactory,
        time: Time,
        private jobExecutor: JobExecutor.Executor,
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


    onJobStarted(job: JobExecutor.Key): void {
        this.updateQueue(job, QueueStatus.STARTED)
    }
    onJobError(job: JobExecutor.Key): void {
        this.updateQueue(job, QueueStatus.ERROR)
    }
    onJobFailure(job: JobExecutor.Key): void {
        this.updateQueue(job, QueueStatus.FAILURE)
    }
    onJobAborted(job: JobExecutor.Key): void {
        this.updateQueue(job, QueueStatus.ABORTED)
    }
    onJobSuccess(job: JobExecutor.Key): void {
        if (job.ref.type === JobRefType.UPDATE) {
            logger.info(`Job success: ${job}`)

            this.systemFilesAccess.getRepositoryConfig(job.source).then(async repositoryConfig => {
                if (repositoryConfig) {
                    let isActive = await this.isActive(job)
                    if (isActive) {
                        //TODO: Check labels on RepositoryConfig to get the correct action.
                        const publications = <DependencyRef.ArtifactRef[]>(await this.publisherManager.publications(job.source, job.sha))
                        await this.publisherManager.addMetaData(job.source, job.sha, publications)
                        const repositoryAccess = this.repositoryAcccessFactory.createAccess(job.source.id)
                        if (job.ref.type === JobRefType.UPDATE) {
                            await repositoryAccess.setValidBuild(job.source.id, job.ref.ref, job.sha)
                        }
                        const action = repositoryConfig.buildAutomation.default
                        logger.debug(`Job successful action: [${action}] ${job}`)
                        if (action === RepositoryConfig.Action.Merge || action === RepositoryConfig.Action.Release) {
                            repositoryAccess.merge(job.source.path, job.ref.ref)
                                .then(async updatedBranch => {
                                    logger.info(`Merged ${job}`)
                                    return this.updateQueue(job, QueueStatus.SUCCEESS).then(() => {
                                        return updatedBranch
                                    })
                                })
                                .then(updatedBranch => {
                                    if (action === RepositoryConfig.Action.Release) {
                                        return this.release(job.source, updatedBranch, VersionType.MINOR).then(version => {
                                            logger.info(`Released ${version.toString()} ${job} (${updatedBranch.ref})`)
                                        })
                                    } else {
                                        return Promise.resolve()
                                    }
                                })
                                .catch(error => {
                                    logger.error(`Could not merge ${job}:${error}`)
                                    //return Promise.reject(error)
                                })
                        }
                    } else {
                        logger.debug(`${job} was registered aborted just before success. No processing.`)
                    }
                } else {
                    logger.warn(`Missing repository config for ${job.source}. No action taken.`)
                }
            }).catch(e => {
                this.updateQueue(job, QueueStatus.FAILURE)
            })

        } else {
            this.updateQueue(job, QueueStatus.SUCCEESS)
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

    private updateQueue(job: JobExecutor.Key, status: QueueStatus): Promise<void> {
        logger.info(`JobManager->QueueUpdate ${job} -> ${status}`)
        return this.queue.addStatus(job.source, job.ref, job.sha, status)
    }

    private async isActive(job: JobExecutor.Key): Promise<boolean> {
        return this.queue.getStatus(job.source, job.ref, job.sha).then(status => {
            return status ? true : false
        })
    }
    getStatus(job: JobExecutor.Key): Promise<QueueStatus | null> {
        return this.queue.getStatus(job.source, job.ref, job.sha).then(status => {
            return status ? status.current().status : null
        })
    }

    onQueueUpdated(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, buildState: BuildState): void {
        const cmd = async () => {
            return this.redis.get().then(async client => {
                const status = buildState.current().status
                const job = new JobExecutor.Key(source, ref, sha)
                logger.info(`Queue updated: ${job} -> ${status}`)
                if (status === QueueStatus.STARTING) {
                    if (ref.type === JobRefType.UPDATE) {
                        this.repositoryAcccessFactory.createAccess(source.id).rebase(source.path, ref.ref)
                            .then(async newSha => {
                                if (newSha) {
                                    logger.info(`Rebased update ${ref} in ${source} sha: ${sha} -> ${newSha}. No more operations. Update event will abort current.`)
                                } else {
                                    logger.debug(`Fast-forward possible for ${ref} in ${source} sha: ${sha}. Continue build start.`)
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
                                        this.updateQueue(job, QueueStatus.DEPENDENCY)
                                    } else {
                                        let isActive = await this.isActive(job)
                                        if (isActive) {
                                            this.jobExecutor.startJob(job)
                                        } else {
                                            logger.debug(`Job ${source}/${ref}/${ref} was aborted. No operation.`)
                                        }
                                    }
                                }
                            })
                            .catch(error => {
                                logger.debug(`Error while rebasing update ${job}: ${error}`)
                                return this.updateQueue(job, QueueStatus.CONFLICT)
                            })
                    } else {
                        throw new Error("Branch builds not implemented yet.")
                    }
                } else if (status === QueueStatus.ABORTED) {
                    this.jobExecutor.abortJob(job)
                }
            })

        }
        this.executionSerializer.execute(this.createSourceExecutionKey(source), cmd)
    }


    private createSourceExecutionKey(source: RepositorySource): string {
        return `${source.id}/${source.path}`
    }

    async onUpdate(update: Update): Promise<void> {
        const cmd = async () => {
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
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            if (normalizedRef) {
                await Promise.all([this.repositoryModelFactory.get(source).invalidate(), this.localGitFactory.invalidate(source)])
                if (normalizedRef.type === NormalizedModel.Type.MAIN_BRANCH) {
                    const hasBuildYml = (await this.systemFilesAccess.getBuildConfig(source, newSha)) ? true : false
                    if (hasBuildYml) {
                        this.activeRepositories.addActiveRepositories(source)
                    } else {
                        this.activeRepositories.removeActiveRepositories(source)
                    }
                } else if (normalizedRef.type === NormalizedModel.Type.RELEASE_TAG) {
                    logger.info(`Reveived release: ${source}/${ref}. Triggering dependency scan for known dependent repos.`)
                    const publications = await this.publisherManager.publications(source, newSha)
                    // Launched in parallel
                    this.scannerManager.processForDependencies(...[[new DependencyRef.GitRef(source)], publications].flat())
                }
            }
            return Promise.resolve()
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


