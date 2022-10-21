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
import { RepositoryAccessFactory } from "../repositories/repository-access/repository-access-factory"
import { NormalizedModel, NormalizedModelUtil } from "../repositories/repository/normalized-model"
import { VersionType } from "../repositories/repository/repository"
import { RepositoryFactory } from "../repositories/repository/repository-factory"
import { DependencyLookup } from '../repositories/scanner/dependency-lookup'
import { ScannerManager } from "../repositories/scanner/scanner-manager"
import { SystemFilesAccess, SystemFilesAccessImpl } from "../repositories/system-files-access"
import { BuildSystem, Update } from './build-system'
import { JobExecutor } from './job-executor/job-executor'
import { ActiveRepositories } from "./queue/active-repositories"
import { Queue } from './queue/queue'
import { QueueImpl } from './queue/queue-impl'
import { SourceCache } from './source-cache'
import { TimeProvider } from "./time"


const logger = createLogger(loggerName(__filename))

export class BuildSystemImpl implements BuildSystem.Service, Queue.Listener, JobExecutor.Listener, BuildSystem.UpdateReceiver {
    private queue: Queue.Service
    private systemFilesAccess: SystemFilesAccess

    constructor(
        private redisFactory: RedisFactory,
        private time: TimeProvider,
        private jobExecutor: JobExecutor.Executor,
        private repositoryAcccessFactory: RepositoryAccessFactory,
        private repositoryModelFactory: RepositoryFactory,
        private activeRepositories: ActiveRepositories,
        private publisherManager: PublisherManager,
        private scannerManager: ScannerManager.Service,
        private activeSystem: ActiveSystem.System,
        private buildLogService: BuildLog.Service,
        private dependencyLookupCache: DependencyLookup.Cache,
        private sourceCache: SourceCache.Service,
    ) {
        this.queue = new QueueImpl(this.redisFactory, this.time, this)
        this.systemFilesAccess = new SystemFilesAccessImpl(repositoryAcccessFactory)
        jobExecutor.setListener(this)
        this.startJobsFromQueue()
    }


    onJobLog(job: JobExecutor.Key, message: string, level: JobExecutor.LogLevel): void {
        const logLevel = level === "warning" ? BuildLogEvents.Level.WARNING : BuildLogEvents.Level.INFO
        this.buildLogService.add(message, logLevel, job.source, job.jobRef.canonicalId)
    }



    onJobStarted(job: JobExecutor.Key): void {
        this.updateQueue(job, Queue.State.STARTED)
    }
    onJobError(job: JobExecutor.Key): void {
        this.updateQueue(job, Queue.State.ERROR)
    }
    onJobFailure(job: JobExecutor.Key): void {
        this.updateQueue(job, Queue.State.FAILURE)
    }
    onJobAborted(job: JobExecutor.Key): void {
        this.updateQueue(job, Queue.State.ABORTED)
    }
    onJobSuccess(job: JobExecutor.Key): void {
        this.updateQueue(job, Queue.State.SUCCEESS)
    }

    private updateQueue(job: JobExecutor.Key, status: Queue.State): Promise<void> {
        return this.queue.addState(job, status).then(completed => {
            return Promise.resolve()
        }).catch(e => {
            logger.error(`Error while updating queue: ${e} for ${job}. No operation`)
            this.buildLogService.add(`Unexpected error when updating queue: ${e}. Please report.`, BuildLogEvents.Level.WARNING, job.source, job.jobRef.canonicalId)
        })
    }
    onQueueTransition(job: JobExecutor.Key, state: Queue.State, previousState: Queue.State | undefined): void {
        this.buildLogService.add(`Job \`${state}\` for \`${job.jobRef.sha.sha}\`.`, BuildLogEvents.Level.INFO, job.source, job.jobRef.canonicalId)
        logger.info(`Queue updated: ${state} -> ${job}`)
        if (state === Queue.State.STARTING) {
            const ref = job.jobRef
            const source = job.source
            if (ref instanceof JobRef.UpdateRef) {
                this.repositoryAcccessFactory.createAccess(source.id).rebase(source.path, ref.updateId)
                    .then(async newSha => {
                        if (newSha) {
                            this.buildLogService.add(`Rebased on tip of target branch to \`${newSha.sha}\`.`, BuildLogEvents.Level.INFO, source, ref.canonicalId)
                            logger.info(`Rebased update ${ref} in ${source} sha: ${ref.sha} -> ${newSha}. No more operations. Update event will abort current.`)
                            this.updateQueue(job, Queue.State.REBASED)
                        } else {
                            this.buildLogService.add(`No rebase necessary. Fast-forward possible.`, BuildLogEvents.Level.INFO, source, ref.canonicalId)
                            logger.debug(`Fast-forward possible for ${ref} in ${source}. Continue build start.`)
                            const dependencyGraph = await this.scannerManager.getDependencyGraph(source, ref.sha)
                            const dependencyProblems = dependencyGraph.getProblems()

                            const dependencyTreeLog = [`***************** Dependency tree for ${source}/${ref}`]
                            dependencyGraph.traverse((ref: DependencyRef.Ref, version: Version, depth: number) => {
                                dependencyTreeLog.push(`${_.repeat(" ", depth * 3)} ${ref.toString()}: ${version.asString()}`)
                            })
                            dependencyTreeLog.push(`***************** Problem count: ${dependencyProblems.length}`)
                            if (dependencyProblems.length) {
                                dependencyTreeLog.push(`Dependendency problems with ${source}/${ref}: ${dependencyProblems.map(p => { return p.message }).join(", ")}. Signalling dependency issue to queue.`)
                            }
                            console.log(dependencyTreeLog.join("\n"))
                            if (dependencyProblems.length) {
                                this.updateQueue(job, Queue.State.DEPENDENCY)
                                this.buildLogService.add(`Build was aborted due to dependency inbalances: \n ${dependencyProblems.map(p => { return `* ${p.message}` }).join("\n")}`, BuildLogEvents.Level.WARNING, source, ref.canonicalId)
                            } else {
                                this.jobExecutor.startJob(job)
                            }
                        }
                    })
                    .catch(error => {
                        logger.debug(`Error while rebasing update ${job}: ${error}`)
                        return this.updateQueue(job, Queue.State.CONFLICT)
                    })
            } else {
                throw new Error(`Only Update builds are supported: ${ref} builds not supported. `)
            }
        } else if (state == Queue.State.SUCCEESS) {
            const ref = job.jobRef
            if (ref instanceof JobRef.UpdateRef) {
                this.systemFilesAccess.getRepositoryConfig(job.source).then(async repositoryConfig => {
                    if (repositoryConfig) {
                        //TODO: Check labels on RepositoryConfig to get the correct action.
                        const publications = <DependencyRef.ArtifactRef[]>(await this.publisherManager.publications(job.source, ref.sha))
                        await this.publisherManager.addMetaData(job.source, ref.sha, publications)
                        const repositoryAccess = this.repositoryAcccessFactory.createAccess(job.source.id)
                        await repositoryAccess.setValidBuild(job.source.id, ref.updateId, ref.sha)
                        const action = repositoryConfig.buildAutomation.default
                        return this.repositoryAcccessFactory.createAccess(job.source.id).getLabels(ref.updateId).then(updateLabels => {
                            const validUpdateLabels = updateLabels || []
                            const labelActions = repositoryConfig.buildAutomation.labels
                            const matchingLabelAction = labelActions.find(la => { return _.includes(validUpdateLabels, la.id) })
                            const action = matchingLabelAction ? matchingLabelAction.action : repositoryConfig.buildAutomation.default
                            logger.debug(`Job successful action: ${action} for ${matchingLabelAction?.id || "default"} ${job} in update-labels:${validUpdateLabels.join(",")}`)
                            if (action === RepositoryConfig.Action.Merge || action === RepositoryConfig.Action.Release) {
                                repositoryAccess.merge(job.source.path, ref.updateId)
                                    .then(async updatedBranch => {
                                        const branchJobRef = new JobRef.BranchRef(updatedBranch.ref, updatedBranch.sha)
                                        this.buildLogService.add(`Merged to target branch \`${updatedBranch.ref.name}\` Post-process action \`${action}\`. Continued [log](${branchJobRef.canonicalId})`, BuildLogEvents.Level.INFO, job.source, job.jobRef.canonicalId)
                                        this.buildLogService.add(`Merged update \`${ref.updateId}\`. Previous [log](${ref.canonicalId})`, BuildLogEvents.Level.INFO, job.source, branchJobRef.canonicalId)
                                        if (action === RepositoryConfig.Action.Release) {
                                            this.release(job.source, updatedBranch, VersionType.MINOR)
                                                .then(version => { })
                                                .catch(error => {
                                                    logger.error(`Could not release ${job}:${error}`)
                                                    this.buildLogService.add(`Could not release: ${error}`, BuildLogEvents.Level.ERROR, job.source, job.jobRef.canonicalId)
                                                })
                                        }
                                    }).catch(error => {
                                        logger.error(`Could not merge ${job}:${error}`)
                                        this.buildLogService.add(`Could not merge: ${error}`, BuildLogEvents.Level.ERROR, job.source, job.jobRef.canonicalId)
                                    })
                            } else {
                                this.buildLogService.add(`Post processing action \`${action}\` resolved. Change left un-merged.`, BuildLogEvents.Level.INFO, job.source, job.jobRef.canonicalId)
                            }
                        }).catch(e => {
                            this.buildLogService.add(`Coult not post-proces change: ${e}`, BuildLogEvents.Level.INFO, job.source, job.jobRef.canonicalId)
                        })

                    } else {
                        logger.warn(`Missing repository config for ${job.source}. No action taken.`)
                    }
                }).catch(e => {
                    logger.error(`Error while post-processing success ${job}: ${e}`)
                })
            } else {
                logger.error(`Not implemented onJobSuccess for ${ref}`)
            }
        } else if (state === Queue.State.QUEUED) {
            this.startJobsFromQueue()
        } else if (Queue.isStateTerminal(state)) {
            if (state === Queue.State.ABORTED) {
                this.jobExecutor.abortJob(job)
            }
            this.startJobsFromQueue()
        }
    }

    async release(source: RepositorySource, branch: Refs.Branch, versionType: VersionType): Promise<Version> {
        const branchJobRef = new JobRef.BranchRef(branch.ref, branch.sha)
        return this.repositoryModelFactory.get(source).modelReader().then(modelReader => {
            const nextVersion = modelReader.nextVersion(branch.ref, versionType)

            return this.publisherManager.publications(source, branch.sha).then(publishedRefs => {
                if (publishedRefs.length) {
                    return this.publisherManager.publish(publishedRefs, branch.sha, nextVersion).then(() => {
                        this.buildLogService.add(`Published references: ${publishedRefs.map(r => { return `\`${r.toString()}:${nextVersion.asString()}\`` }).join(", ")}`, BuildLogEvents.Level.INFO, source, branchJobRef.canonicalId)
                    })
                } else {
                    return Promise.resolve()
                }
            }).then(() => {
                logger.info(`Releasing next version ${nextVersion.asString()} from ${source}/${branch.ref.name}@${branch.sha}`)
                return this.repositoryAcccessFactory.createAccess(source.id).createTag(source.path, branch.sha, `v${nextVersion.asString()}`, `Released by Common-build`).then(tag => {
                    this.buildLogService.add(`Released version \`${nextVersion.asString()}\``, BuildLogEvents.Level.INFO, source, branchJobRef.canonicalId)
                    return nextVersion
                })
                    .catch(e => {
                        this.buildLogService.add(`Could not create Git-release: ${e}`, BuildLogEvents.Level.ERROR, source, branchJobRef.canonicalId)
                        logger.error(`Error while creating source tag: ${e}. NOTE: Binaries must be cleaned up.`)
                        return Promise.reject(e)
                    })
            }).catch(e => {
                this.buildLogService.add(`Could not publish binaries. ${e}`, BuildLogEvents.Level.ERROR, source, branchJobRef.canonicalId)
                return Promise.reject(e)
            })
        })
    }

    private startJobsFromQueue(): Promise<void> {
        return this.queue.start(10).then(startedJobs => {
            if (startedJobs.length) {
                logger.debug(`Starting ${startedJobs.length} from queue.`)
            }
        })
    }


    getStatus(job: JobExecutor.Key): Promise<Queue.State | undefined> {
        return this.queue.getState(job)
    }

    private getBuildConfigIfActive(source: RepositorySource, sha: Refs.ShaRef): Promise<BuildConfig.Config | false | Error> {
        return this.activeSystem.isActive(source).then(async isActive => {
            if (isActive) {
                try {
                    let buildYml = await this.systemFilesAccess.getBuildConfig(source, sha, true)
                    if (buildYml) {
                        return Promise.resolve(buildYml)
                    } else {
                        logger.debug(`No ${BuildConfig.FILE_PATH} for ${source}:${sha}. No processing.`)
                        return Promise.resolve(false)
                    }
                } catch (e) {
                    return Promise.resolve(<Error>e)
                }
            } else {
                return Promise.resolve(false)
            }
        })
    }



    async onUpdate(update: Update, message: string, error?: "error"): Promise<void> {
        console.log(`Received update: ${update}`)

        return this.sourceCache.ensureRef(update.source, update.sha, update.refSpec).then(() => {
            return this.getBuildConfigIfActive(update.source, update.sha).then(buildConfig => {
                if (buildConfig) {
                    const job = new JobExecutor.Key(update.source, new JobRef.UpdateRef(update.id, update.target, update.sha))
                    const infoUrl = this.buildLogService.getLogUrl(job.source, job.jobRef.canonicalId)
                    this.jobExecutor.setInfoUrl(job, infoUrl)
                    if (buildConfig instanceof BuildConfig.Config) {
                        if (error) {
                            this.buildLogService.add(message, BuildLogEvents.Level.WARNING, job.source, job.jobRef.canonicalId)
                            return Promise.resolve()
                        } else {
                            this.buildLogService.add(message, BuildLogEvents.Level.INFO, job.source, job.jobRef.canonicalId)
                            this.activeRepositories.addActiveRepositories(update.source)
                            return this.queue.push(job).then(_ => { return })
                        }
                    } else {
                        const buildConfigError = <Error>buildConfig
                        this.buildLogService.add(`Parse error on \`${BuildConfig.FILE_PATH}\`: ${buildConfigError}`, BuildLogEvents.Level.ERROR, job.source, job.jobRef.canonicalId)
                        return Promise.resolve()
                    }
                } else {
                    logger.debug(`Skip processing update: ${update}. Repository not active in ${this.activeSystem.systemId}`)
                    return Promise.resolve()
                }
            })
        }).catch(e => {
            logger.error(`Could not ensure ref: ${update}: ${e}`)
        })
    }

    async onPush(source: RepositorySource, entity: Refs.Entity): Promise<void> {

        console.log(`Received push: ${source} ${entity}`)

        const command = () => Promise.resolve().then(() => {
            const sourceCacheOps = entity.ref instanceof Refs.BranchRef ? this.sourceCache.ensureEntity(source, entity, entity.ref.refSpec) : this.sourceCache.ensureRef(source, entity.ref, entity.ref.refSpec)
            sourceCacheOps.then(() => {
                const ref = entity.ref
                const sha = entity.sha
                return this.getBuildConfigIfActive(source, sha).then(buildConfig => {
                    if (buildConfig) {
                        if (buildConfig instanceof BuildConfig.Config) {
                            const normalizedRef = NormalizedModelUtil.normalize(ref)
                            if (normalizedRef) {
                                return this.scannerManager.registerDependencies(source).then(async () => {
                                    if (normalizedRef instanceof NormalizedModel.MainBranchRef) {
                                        const hasBuildYml = (await this.systemFilesAccess.getBuildConfig(source, sha)) ? true : false
                                        if (hasBuildYml) {
                                            this.activeRepositories.addActiveRepositories(source)
                                        } else {
                                            this.activeRepositories.removeActiveRepositories(source)
                                        }
                                    } else if (normalizedRef instanceof NormalizedModel.ReleaseTagRef) {
                                        logger.info(`Reveived release: ${source}/${ref}`)
                                        return this.publisherManager.publications(source, ref).then(publications => {
                                            const releasePublications = [new DependencyRef.GitRef(source), publications].flat()
                                            this.dependencyLookupCache.invalidate(...releasePublications).then(() => {
                                                return this.scannerManager.processByReferences(...releasePublications)
                                            })
                                        })
                                    }
                                })
                            } else {
                                return Promise.resolve()
                            }
                        } else {
                            const buildConfigError = <Error>buildConfig
                            logger.warn(`Could not parse build-config for ${source}/${sha}: ${buildConfigError}`)
                        }
                    } else {
                        logger.debug(`Skip processing push: ${source}/${ref}. Repository not active in ${this.activeSystem.systemId}`)
                        return Promise.resolve()
                    }
                })
            })
        })
        command()
            .catch(e => {
                logger.error(`Could not ensure: ${entity} on ${source}: ${e}`)
                return this.sourceCache.fetchAllDefaults(source).then(() => {
                    return command()
                })
            }).catch(e => {
                logger.error(`Could not ensure ref: ${entity} on ${source}. Tried fetchAll and retry still failure.`)

            })
    }

    onDelete(source: RepositorySource, ref: Refs.EntityRef): Promise<void> {
        return this.activeSystem.isActive(source).then(isActive => {
            if (isActive) {
                return this.sourceCache.ensureDeleted(source, ref)
            } else {
                logger.debug(`Skip processing delete: ${source}/${ref}. Repository not active in ${this.activeSystem.systemId}`)
                return Promise.resolve()
            }
        }).catch(e => {
            logger.error(`Could not ensure deletion of ${ref} at ${source}`)
        })
    }

    onPrune(source: RepositorySource): Promise<void> {
        return this.activeSystem.isActive(source).then(isActive => {
            if (isActive) {
                return this.sourceCache.prune(source)
            }
        })
    }

}


