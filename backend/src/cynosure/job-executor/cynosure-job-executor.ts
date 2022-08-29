import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";
import { JobExecutor, JobExecutorListener } from "../../system/job-executor/job-executor";
import { JobRef } from "../../system/job-executor/job-ref";
import { ensureDefined } from "../../utils/ensures";
import { CynosureApiConnector, CynosureProtocol } from "../cynosure-api-connector/cynosure-api-connector";
import { CynosureApiConnectorFactory } from "../cynosure-api-connector/cynosure-api-connector-factory";

const logger = createLogger(loggerName(__filename))

enum JobStatus {
    STARTED = "started",
    ABORTED = "aborted"
}

export class CynosureJobExecutor implements JobExecutor {
    constructor(private cynosureApiConnectorFactory: CynosureApiConnectorFactory, private redisFactory: RedisFactory) { }
    private listener: JobExecutorListener | null = null
    private static JOB_TTL_SECONDS = 24 * 60 * 60
    private static ACTIVITY_NOT_FOUND_MAX_POLL = 100
    private static ACTIVITY_POLL_INTERVALL_SECONDS = 5
    private createJobKey(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): string {
        return `cynosure-job-executor:${source.id}/${source.path}/${ref.serialize()}/${sha.sha}`
    }


    async startJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        return this.redisFactory.get().then(async client => {
            const jobKey = this.createJobKey(source, ref, sha)
            const jobStatusWasSet = await client.set(jobKey, JobStatus.STARTED, "EX", CynosureJobExecutor.JOB_TTL_SECONDS, "NX")
            if (jobStatusWasSet) {
                const cynosureApiConnector = this.cynosureApiConnectorFactory.createApiConnector(source.id)
                if (cynosureApiConnector) {
                    return cynosureApiConnector.findProductId(source.path)
                        .then(async productId => {
                            if (productId) {
                                logger.info(`Starting Cynosure Activity ${source}/${sha} ${ref.serialize()} -> ${productId} `)
                                const jobStatus = await client.get(jobKey)
                                if (jobStatus === JobStatus.STARTED) {
                                    await cynosureApiConnector.startActivity(productId, sha)
                                    logger.info(`Started Cynosure Activity ${source} ${ref.serialize()}:${sha} -> ${productId}`)
                                    ensureDefined(this.listener).onJobStarted(source, ref, sha)
                                    this.startPoll(source, productId, ref, sha, cynosureApiConnector)
                                } else {
                                    logger.info(`Skipped starting Cynosure Activity ${source} ${ref.serialize()}:${sha} -> ${productId}. Job aborted.`)
                                }
                                return Promise.resolve()
                            } else {
                                return Promise.reject(new Error(`${source} is not configured in Cynosure`))
                            }
                        }).catch(error => {
                            return Promise.reject(error)
                        })
                } else {
                    logger.warn(`No Cynosure API-connector available for ${source.id}. Can not start job.`)
                }
            } else {
                logger.info(`Skip start Cynosure Activity ${source}/${sha} ${ref.serialize()}. Was aborted.`)
                return Promise.resolve()
            }
        })

    }

    private startPoll(source: RepositorySource, productId: CynosureProtocol.ProductId, ref: JobRef, sha: Refs.ShaRef, connector: CynosureApiConnector): void {
        this.redisFactory.get().then(async client => {
            let notFoundPollCount = 0
            const jobKey = this.createJobKey(source, ref, sha)
            const executePoll = () => {
                setTimeout(() => {
                    client.get(jobKey).then(jobStatus => {
                        if (jobStatus === JobStatus.STARTED) {
                            connector.findActivity(productId, sha).then(activity => {
                                if (activity) {
                                    logger.debug(`Activity POLL ${productId}/${sha}: ${activity.state}, ${activity.verdict}, ${activity.activityId}`)
                                    if (activity.state === CynosureProtocol.ActivityState.FINISHED) {
                                        client.del(jobKey)
                                        if (activity.verdict === CynosureProtocol.ActivityVerdict.PASSED) {
                                            ensureDefined(this.listener).onJobSuccess(source, ref, sha)
                                        } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ABORTED) {
                                            logger.debug(`Cynosure aborted job: ${productId}/${sha}`)
                                        } else if (activity.verdict === CynosureProtocol.ActivityVerdict.FAILED) {
                                            ensureDefined(this.listener).onJobFailure(source, ref, sha)
                                        } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ERRORED) {
                                            ensureDefined(this.listener).onJobError(source, ref, sha)
                                        } else if (activity.verdict === CynosureProtocol.ActivityVerdict.SKIPPED) {
                                            //@TODO: Maybe a new state?
                                            ensureDefined(this.listener).onJobError(source, ref, sha)
                                        }
                                    } else {
                                        executePoll()
                                    }
                                } else {
                                    notFoundPollCount++
                                    if (notFoundPollCount < CynosureJobExecutor.ACTIVITY_NOT_FOUND_MAX_POLL) {
                                        logger.debug(`Activity ${productId}/${sha} not found. Retry ${notFoundPollCount}. Schedule retry.`)
                                        executePoll()
                                    } else {
                                        logger.debug(`Activity ${productId}/${sha} not found. No more retries. Poll count: ${notFoundPollCount}. Signalling error to queue. `)
                                        ensureDefined(this.listener).onJobError(source, ref, sha)
                                    }
                                }
                            })
                        } else {
                            logger.debug(`Activity ${productId}/${sha} aborted. No more polling.`)
                        }
                    })
                }, CynosureJobExecutor.ACTIVITY_POLL_INTERVALL_SECONDS * 1000)
            }
            executePoll()
        })

    }

    abortJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        return this.redisFactory.get().then(async client => {
            const jobKey = this.createJobKey(source, ref, sha)
            await client.set(jobKey, JobStatus.ABORTED, "EX", CynosureJobExecutor.JOB_TTL_SECONDS)
            const connector = this.cynosureApiConnectorFactory.createApiConnector(source.id)
            if (connector) {
                return connector.findProductId(source.path)
                    .then(async productId => {
                        if (productId) {
                            logger.debug(`Requesting cynosure to abort job: ${productId}/${sha}`)
                            connector.findActivity(productId, sha).then(activity => {
                                if (activity) {
                                    connector.abortActivity(activity.activityId, sha, "Newer commit on same Change.")
                                } else {
                                    logger.warn(`Could not find Cynosure job to abort: ${productId}/${sha}`)
                                }
                            })
                        } else {
                            return Promise.reject(new Error(`${source} is not configured in Cynosure`))
                        }
                    }).catch(error => {
                        return Promise.reject(error)
                    })
            } else {
                logger.warn(`No Cynosure API-connector available for ${source.id}. Can not abort job.`)
            }
        })
    }

    setListener(listener: JobExecutorListener): void {
        this.listener = listener
    }
}

