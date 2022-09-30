import _ from 'lodash'
import { ActiveSystem } from '../active-system/active-system'
import { BuildLog } from '../buildlog/buildlog'
import { SystemConfig } from "../config/system-config"
import { BuildLogEvents } from '../domain-model/buildlog-events/buildlog-events'
import { JobRef } from '../domain-model/job-ref/job-ref'
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
        public readonly changeNumber: number,
        public readonly url: string
    ) { }

    toString(): string {
        return `Change ${this.id}/${this.changeNumber} (${this.source}) -> ${this.target} (${this.labels.join(", ")})`
    }

}

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
        private activeSystem: ActiveSystem.System,
        private buildLogService: BuildLog.Service,
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
        const ref = job.jobRef
        if (ref instanceof JobRef.UpdateRef) {
            logger.info(`Job success: ${job}`)
            this.systemFilesAccess.getRepositoryConfig(job.source).then(async repositoryConfig => {
                if (repositoryConfig) {
                    let isActive = await this.isActive(job)
                    if (isActive) {
                        //Fire and forget
                        this.updateQueue(job, QueueStatus.SUCCEESS)
                        //TODO: Check labels on RepositoryConfig to get the correct action.
                        const publications = <DependencyRef.ArtifactRef[]>(await this.publisherManager.publications(job.source, ref.sha))
                        await this.publisherManager.addMetaData(job.source, ref.sha, publications)
                        const repositoryAccess = this.repositoryAcccessFactory.createAccess(job.source.id)
                        await repositoryAccess.setValidBuild(job.source.id, ref.updateId, ref.sha)
                        const action = repositoryConfig.buildAutomation.default
                        logger.debug(`Job successful action: [${action}] ${job}`)
                        if (action === RepositoryConfig.Action.Merge || action === RepositoryConfig.Action.Release) {
                            repositoryAccess.merge(job.source.path, ref.updateId)
                                .then(async updatedBranch => {
                                    logger.info(`Merged ${job}`)
                                    const branchJobRef = new JobRef.BranchRef(updatedBranch.ref, updatedBranch.sha)
                                    this.buildLogService.add(`Merged to target branch \`${updatedBranch.ref.name}\`. Continued [log](${branchJobRef.logId()})`, BuildLogEvents.Level.INFO, job.source, job.jobRef.logId())
                                    this.buildLogService.add(`Merged update \`${ref.updateId}\`. Previous [log](${ref.logId()})`, BuildLogEvents.Level.INFO, job.source, branchJobRef.logId())
                                    if (action === RepositoryConfig.Action.Release) {
                                        return this.release(job.source, updatedBranch, VersionType.MINOR).then(version => { })
                                    } else {
                                        return Promise.resolve()
                                    }
                                }).catch(error => {
                                    logger.error(`Could not merge ${job}:${error}`)
                                    this.buildLogService.add(`Could not merge: ${error}`, BuildLogEvents.Level.ERROR, job.source, job.jobRef.logId())
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
        const branchJobRef = new JobRef.BranchRef(branch.ref, branch.sha)
        //Clear
        return Promise.all([this.localGitFactory.invalidate(source), this.repositoryModelFactory.get(source).invalidate()]).then(async () => {
            const repositoryModel = this.repositoryModelFactory.get(source)
            const nextVersion = (await repositoryModel.modelReader()).nextVersion(branch.ref, versionType)

            return this.publisherManager.publications(source, branch.sha).then(publishedRefs => {
                if (publishedRefs.length) {
                    return this.publisherManager.publish(publishedRefs, branch.sha, nextVersion).then(() => {
                        this.buildLogService.add(`Published references: ${publishedRefs.map(r => { return `\`${r.toString()}:${nextVersion.asString()}\`` }).join(", ")}`, BuildLogEvents.Level.INFO, source, branchJobRef.logId())
                    })
                } else {
                    return Promise.resolve()
                }
            }).then(() => {
                logger.info(`Releasing next version ${nextVersion.asString()} from ${source}/${branch.ref.name}@${branch.sha}`)
                return this.repositoryAcccessFactory.createAccess(source.id).createTag(source.path, branch.sha, `v${nextVersion.asString()}`, `Released by Common-build`).then(tag => {
                    this.buildLogService.add(`Released version \`${nextVersion.asString()}\``, BuildLogEvents.Level.INFO, source, branchJobRef.logId())
                    return nextVersion
                })
                    .catch(e => {
                        this.buildLogService.add(`Could not create Git-release: ${e}`, BuildLogEvents.Level.ERROR, source, branchJobRef.logId())
                        logger.error(`Error while creating source tag: ${e}. NOTE: Binaries must be cleaned up.`)
                        return Promise.reject(e)
                    })
            }).catch(e => {
                this.buildLogService.add(`Could not publish binaries. ${e}`, BuildLogEvents.Level.ERROR, source, branchJobRef.logId())
                return Promise.reject(e)
            })
        })
    }

    private updateQueue(job: JobExecutor.Key, status: QueueStatus): Promise<void> {
        logger.info(`JobManager->QueueUpdate ${job} -> ${status}`)
        return this.queue.addStatus(job.source, job.jobRef, status)
    }

    private async isActive(job: JobExecutor.Key): Promise<boolean> {
        return this.queue.getStatus(job.source, job.jobRef).then(status => {
            return status ? true : false
        })
    }
    getStatus(job: JobExecutor.Key): Promise<QueueStatus | null> {
        return this.queue.getStatus(job.source, job.jobRef).then(status => {
            return status ? status.current().status : null
        })
    }

    onQueueUpdated(source: RepositorySource, ref: JobRef.Ref, buildState: BuildState): void {
        const cmd = async () => {
            this.buildLogService.add(`Queue transition: \`${buildState.current().status}\` `, BuildLogEvents.Level.INFO, source, ref.logId())
            return this.redis.get().then(async client => {
                const status = buildState.current().status
                const job = new JobExecutor.Key(source, ref)
                logger.info(`Queue updated: ${job} -> ${status}`)
                if (status === QueueStatus.STARTING) {
                    if (ref instanceof JobRef.UpdateRef) {
                        this.repositoryAcccessFactory.createAccess(source.id).rebase(source.path, ref.updateId)
                            .then(async newSha => {
                                if (newSha) {
                                    this.buildLogService.add(`Rebased on tip of target branch to \`${newSha.sha}\`.`, BuildLogEvents.Level.INFO, source, ref.logId())
                                    logger.info(`Rebased update ${ref} in ${source} sha: ${ref.sha} -> ${newSha}. No more operations. Update event will abort current.`)
                                } else {
                                    this.buildLogService.add(`No rebase necessary. Fast-forward possible.`, BuildLogEvents.Level.INFO, source, ref.logId())
                                    logger.debug(`Fast-forward possible for ${ref} in ${source}. Continue build start.`)
                                    const dependencyTree = await this.scannerManager.allDependencies(source, ref.sha)
                                    const dependencyProblems = dependencyTree.getProblems()

                                    const dependencyTreeLog = [`***************** Dependency tree for ${source}/${ref}`]
                                    dependencyTree.traverse((ref: DependencyRef.Ref, version: Version, depth: number) => {
                                        dependencyTreeLog.push(`${_.repeat(" ", depth * 3)} ${ref.toString()}: ${version.asString()}`)
                                    })
                                    dependencyTreeLog.push(`***************** Problem count: ${dependencyProblems.length}`)
                                    if (dependencyProblems.length) {
                                        dependencyTreeLog.push(`Dependendency problems with ${source}/${ref}: ${dependencyProblems.map(p => { return p.asString() }).join(", ")}. Signalling dependency issue to queue.`)
                                    }
                                    console.log(dependencyTreeLog.join("\n"))
                                    if (dependencyProblems.length) {
                                        this.updateQueue(job, QueueStatus.DEPENDENCY)
                                        this.buildLogService.add(`Build was aborted due to dependency inbalances: \n ${dependencyProblems.map(p => { return `* ${p.asString()}` }).join("\n")}`, BuildLogEvents.Level.WARNING, source, ref.logId())
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
                        throw new Error(`Only Update builds are supported: ${ref} builds not supported. `)
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

    private getBuildConfigIfActive(source: RepositorySource, sha: Refs.ShaRef, isActiveOp?: () => Promise<void>): Promise<BuildConfig.Config | Error | undefined> {
        const cmd = async () => {
            return this.activeSystem.isActive(source).then(async isActive => {
                if (isActive) {
                    if (isActiveOp) {
                        await isActiveOp()
                    }
                    try {
                        let buildYml = await this.systemFilesAccess.getBuildConfig(source, sha, true)
                        if (buildYml) {
                            return Promise.resolve(buildYml)
                        } else {
                            logger.debug(`No ${BuildConfig.FILE_PATH} for ${source}:${sha}. No processing.`)
                            return Promise.resolve(undefined)
                        }
                    } catch (e) {
                        return Promise.resolve(<Error>e)
                    }
                } else {
                    return Promise.resolve(undefined)
                }
            })
        }

        return this.executionSerializer.execute(this.createSourceExecutionKey(source), cmd)
    }

    async onUpdate(update: Update): Promise<void> {
        const cmd = async () => {
            return this.getBuildConfigIfActive(update.source, update.sha, () => {
                return this.localGitFactory.execute(update.source, LocalGitCommands.fetchUpdate(update), LocalGitLoadMode.CACHED).then()
            }).then(async result => {
                if (result) {
                    const jobKey = new JobExecutor.Key(update.source, new JobRef.UpdateRef(update.id, update.sha))
                    const infoUrl = this.buildLogService.getLogUrl(jobKey.source, jobKey.jobRef.logId())
                    this.jobExecutor.setInfoUrl(jobKey, infoUrl)
                    if (result instanceof BuildConfig.Config) {
                        this.buildLogService.add(`Received Gerrit \`ref-updated\` event:\n\n* id: [${update.id}](${update.url})\n* commit: \`${update.sha.sha}\``, BuildLogEvents.Level.INFO, jobKey.source, jobKey.jobRef.logId())
                        this.activeRepositories.addActiveRepositories(update.source)
                        return this.queue.upsert(update).then(_ => { return })
                    } else if (result instanceof Error) {
                        this.buildLogService.add(`Parse error on \`${BuildConfig.FILE_PATH}\`: ${result}`, BuildLogEvents.Level.ERROR, jobKey.source, jobKey.jobRef.logId())
                        return Promise.resolve()
                    }
                } else {
                    logger.debug(`OnUpdate skipped. ${update.source} not active in ${this.activeSystem.systemId} `)
                    return Promise.resolve()
                }
            })
        }
        return this.executionSerializer.execute(this.createSourceExecutionKey(update.source), cmd)
    }

    async onPush(source: RepositorySource, ref: Refs.Ref, newSha: Refs.ShaRef): Promise<void> {
        const cmd = async () => {
            //We need to run this here because updates to refs/meta/config
            await Promise.all([this.repositoryModelFactory.get(source).invalidate(), this.localGitFactory.invalidate(source)])
            return this.activeSystem.isActive(source).then(async isActive => {
                if (isActive) {
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
                            logger.info(`Reveived release: ${source}/${ref}. Triggering dependency scan for known dependent repos.`)
                            const publications = await this.publisherManager.publications(source, newSha)
                            // Launched in parallel
                            this.scannerManager.processForDependencies(...[[new DependencyRef.GitRef(source)], publications].flat())
                        }
                    }
                    return Promise.resolve()
                } else {
                    logger.debug(`OnPush skipped. ${source} not active in ${this.activeSystem.systemId} `)
                }
            })
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


