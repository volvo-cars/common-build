import _ from 'lodash';
import { ShutdownManager } from '../../shutdown-manager/shutdown-manager'
import { createLogger, loggerName } from "../../logging/logging-factory";
import { JobExecutor } from '../../system/job-executor/job-executor';
import { TaskQueue } from "../../task-queue/task-queue";
import { Duration, Time } from "../../task-queue/time";
import { CynosureProtocol } from "../cynosure-api-connector/cynosure-api-connector";
import { CynosureApiConnectorFactory } from "../cynosure-api-connector/cynosure-api-connector-factory";
import { ProcessingStates } from "./processing-states";
import { RedisFactory } from '../../redis/redis-factory';

const logger = createLogger(loggerName(__filename))

class WaitRetryConfig {
    constructor(
        public readonly retryCount: number,
        public readonly wait: Duration
    ) { }
}

const defaultErrorWaitDuration = Duration.fromSeconds(30)
const defaultErrorRetryCount = 20
const defaultErrorConfig = new WaitRetryConfig(defaultErrorRetryCount, defaultErrorWaitDuration)

const Constants = {
    QUEUED: {
        findProduct: new WaitRetryConfig(3, Duration.fromSeconds(3)), // Product (RepositorySource) doesn't exist in Cynosure
        startActivity: new WaitRetryConfig(30, Duration.fromSeconds(30)),
        errorConfig: defaultErrorConfig,
    },
    STARTING: {
        findActivity: new WaitRetryConfig(100, Duration.fromSeconds(10)),
        errorConfig: defaultErrorConfig,
    },
    STARTED: {
        pollInterval: Duration.fromSeconds(10),
        findActivity: new WaitRetryConfig(3, Duration.fromSeconds(10)), // Activity (RepositorySource) doesn't exist in Cynosure
        errorConfig: defaultErrorConfig,
    },
    REPOLL: {
        delayed: Duration.fromSeconds(10),
        direct: Duration.NO_DURATION
    }
}

export class CynosureJobExecutor implements JobExecutor.Executor, ShutdownManager.Service {

    private processTimer: ReturnType<typeof setTimeout> | undefined

    public serviceName = `Cynosure Job Executor`

    public shutdownPriority = 20;



    constructor(private cynosureApiConnectorFactory: CynosureApiConnectorFactory, private taskQueue: TaskQueue.Service) { }

    setInfoUrl(key: JobExecutor.Key, url: string): void {
        const connector = this.cynosureApiConnectorFactory.createApiConnector(key.source.id)
        if (connector) {
            connector.findProductId(key.source.path).then(productId => {
                if (productId) {
                    return connector.setInfoUrl(productId, key.jobRef.sha, url)
                } else {
                    return Promise.resolve()
                }
            })
        }
    }

    private listener: JobExecutor.Listener | null = null
    private active: boolean = true
    private currentProcess: Promise<any> | undefined

    shutdown(): Promise<void> {
        this.active = false
        clearTimeout(this.processTimer)
        return (this.currentProcess || Promise.resolve())
    }

    private scheduleProcess(wait: Duration) {
        if (this.active) {
            clearTimeout(this.processTimer)
            this.processTimer = setTimeout(() => {
                this.currentProcess = this.process().then(directReschedule => {
                    if (directReschedule) {
                        this.scheduleProcess(Constants.REPOLL.direct)
                    } else {
                        this.scheduleProcess(Constants.REPOLL.delayed)
                    }
                })
            }, wait.milliSeconds())
        }
    }

    private process(): Promise<boolean> { // true = direct reschedule, false delayed reschedule
        const listener = this.listener
        if (listener) {
            const handleError = (e: Error, uid: string, key: JobExecutor.Key, state: ProcessingStates.JobState, config: WaitRetryConfig): Promise<void> => {
                if (state.failureCount < config.retryCount) {
                    logger.warn(`Wait in [${state.constructor.name}] for ${key} (${e}). Rescheduling retry ${state.failureCount + 1}/${config.retryCount}.`)
                    return this.taskQueue.upsert(uid, config.wait, state.withNewFailure().serialize())
                } else {
                    logger.warn(`Error in [${state.constructor.name}] for ${key}. No more retries of ${config.retryCount}. Signalling JobError.`)
                    listener.onJobError(key)
                    return Promise.resolve()
                }
            }


            return this.taskQueue.popExpired(2, Time.now()).then(entries => {
                if (entries.entries.length) {
                    return Promise.all(entries.entries.map(entry => {
                        const key = JobExecutor.Key.deserialize(entry.uid)
                        const connector = this.cynosureApiConnectorFactory.createApiConnector(key.source.id)
                        if (connector) {
                            const states = entry.data.map(s => { return ProcessingStates.JobState.deserialize(s) })
                            const findState = (f: (x: ProcessingStates.JobState) => boolean): [number, ProcessingStates.JobState | undefined] => {
                                const index = _.findLastIndex(states, f)
                                return index >= 0 ? [index, states[index]] : [index, undefined]
                            }
                            const [queuedIndex, rawQueuedState] = findState(s => { return s instanceof ProcessingStates.JobQueued })
                            const [startingIndex, rawStartingState] = findState(s => { return s instanceof ProcessingStates.JobStarting })
                            const [startedIndex, rawStartedState] = findState(s => { return s instanceof ProcessingStates.JobStarted })
                            const [abortedIndex, rawAbortState] = findState(s => { return s instanceof ProcessingStates.JobAbort })

                            if (abortedIndex >= 0) {
                                //Abort job
                                if (queuedIndex >= 0 && queuedIndex < abortedIndex) {
                                    logger.debug(`Cancelled before job start: ${key}. No operation.`)
                                    return Promise.resolve()
                                } else if (startedIndex >= 0) {
                                    const startedState = <ProcessingStates.JobStarted>rawStartedState
                                    logger.debug(`Cancelling Cynosure job: ${key}.`)
                                    return connector.abortActivity(startedState.activityId, key.jobRef.sha, "")
                                }
                            } else if (rawQueuedState) {
                                // Starting queued job
                                const queuedState = <ProcessingStates.JobQueued>rawQueuedState
                                return connector.findProductId(key.source.path).then(productId => {
                                    if (productId) {
                                        return connector.startActivity(productId, key.jobRef.sha).then((started) => {
                                            if (started) {
                                                logger.info(`Starting Cynosure Activity ${key} -> Product: ${productId}`)
                                                return this.taskQueue.upsert(entry.uid, Constants.STARTING.findActivity.wait, new ProcessingStates.JobStarting(productId, 0).serialize())
                                            } else {
                                                return handleError(new Error(`Could not start activitry in Cynosure.`), entry.uid, key, queuedState, Constants.QUEUED.startActivity)
                                            }
                                        })
                                    } else {
                                        return handleError(new Error(`Could not find product in Cynosure.`), entry.uid, key, queuedState, Constants.QUEUED.findProduct)
                                    }
                                }).catch(e => {
                                    return handleError(e, entry.uid, key, queuedState, Constants.QUEUED.errorConfig)
                                })
                            } else if (rawStartingState) {
                                const startingState = <ProcessingStates.JobStarting>rawStartingState
                                return connector.findActivity(startingState.productId, key.jobRef.sha).then(activity => {
                                    if (activity) {
                                        logger.info(`Started Cynosure Activity ${key} -> Product: ${startingState.productId} Activity: ${activity.activityId}`)
                                        listener.onJobStarted(key)
                                        return this.taskQueue.upsert(entry.uid, Constants.STARTED.pollInterval, new ProcessingStates.JobStarted(startingState.productId, activity.activityId, 0).serialize())
                                    } else {
                                        return handleError(new Error(`Could not find activity.`), entry.uid, key, startingState, Constants.STARTING.findActivity)
                                    }
                                }).catch(e => {
                                    return handleError(e, entry.uid, key, startingState, Constants.STARTING.errorConfig)
                                })
                            } else if (rawStartedState) {
                                const startedState = <ProcessingStates.JobStarted>rawStartedState
                                connector.findActivity(startedState.productId, key.jobRef.sha).then(activity => {
                                    if (activity) {
                                        logger.debug(`Cynosure activity poll ${key} Cynosure: ${startedState.productId}/${activity.activityId}: State: ${activity.state} Verdict:${activity.verdict}`)
                                        if (activity.state === CynosureProtocol.ActivityState.FINISHED) {
                                            if (activity.verdict === CynosureProtocol.ActivityVerdict.PASSED) {
                                                listener.onJobSuccess(key)
                                                return Promise.resolve()
                                            } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ABORTED) {
                                                logger.debug(`Cynosure aborted job: ${key} Cynosure: ${startedState.productId}/${activity.activityId}`)
                                                listener.onJobAborted(key)
                                                return Promise.resolve()
                                            } else if (activity.verdict === CynosureProtocol.ActivityVerdict.FAILED) {
                                                listener.onJobFailure(key)
                                                return Promise.resolve()
                                            } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ERRORED) {
                                                listener.onJobError(key)
                                                return Promise.resolve()
                                            } else if (activity.verdict === CynosureProtocol.ActivityVerdict.SKIPPED) {
                                                logger.warn(`Cynosure skipped job: ${key} Cynosure: ${startedState.productId}/${activity.activityId}. No transition for skipped. Sending aborted to queue.`)
                                                listener.onJobAborted(key)
                                            } else {
                                                logger.debug(`Unknown final state from Cynosure: ${activity.state}: Signalling error to job. ${key}`)
                                                listener.onJobError(key)
                                                return Promise.resolve()
                                            }
                                        } else {
                                            return this.taskQueue.upsert(entry.uid, Constants.STARTED.pollInterval, new ProcessingStates.JobStarted(startedState.productId, startedState.activityId, 0).serialize())
                                        }
                                    } else {
                                        return handleError(new Error(`Could not find activity.`), entry.uid, key, startedState, Constants.STARTED.findActivity)
                                    }
                                }).catch(e => {
                                    return handleError(e, entry.uid, key, startedState, Constants.STARTED.errorConfig)
                                })
                            }
                        } else {
                            logger.debug(`Cynosure API connector not found ${key}. Removing job.`)
                            listener.onJobError(key)
                            return Promise.resolve()
                        }
                    })).then(() => {
                        return entries.hasMore
                    })
                } else {
                    return entries.hasMore
                }
            })
        } else {
            logger.warn(`No listener attached to Cynosure Job Executor. Trying in ${Constants.REPOLL.delayed}.`)
            this.scheduleProcess(Constants.REPOLL.delayed)
            return Promise.resolve(false)
        }
    }

    startJob(key: JobExecutor.Key): Promise<void> {
        return this.taskQueue.upsert(key.serialize(), Duration.NO_DURATION, new ProcessingStates.JobQueued(0).serialize()).finally(() => {
            this.scheduleProcess(Duration.NO_DURATION)
        })
    }
    abortJob(key: JobExecutor.Key): Promise<void> {
        return this.taskQueue.upsert(key.serialize(), Duration.NO_DURATION, new ProcessingStates.JobAbort("Newer commit.").serialize()).finally(() => {
            this.scheduleProcess(Duration.NO_DURATION)
        })
    }

    setListener(listener: JobExecutor.Listener): void {
        logger.debug("Setting listener. Starting Poll.")
        this.listener = listener
        this.scheduleProcess(Duration.NO_DURATION)
    }
}


