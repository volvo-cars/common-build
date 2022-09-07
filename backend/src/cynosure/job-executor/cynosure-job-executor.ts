import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { JobExecutor, JobExecutorListener } from "../../system/job-executor/job-executor";
import { JobRef } from "../../system/job-executor/job-ref";
import { CynosureProtocol } from "../cynosure-api-connector/cynosure-api-connector";
import { CynosureApiConnectorFactory } from "../cynosure-api-connector/cynosure-api-connector-factory";
import { TaskQueue } from "../../task-queue/task-queue";
import { Duration, Time } from "../../task-queue/time";
import _ from 'lodash'

const logger = createLogger(loggerName(__filename))

class JobKey {
    constructor(public readonly source: RepositorySource, public readonly ref: JobRef, public readonly sha: Refs.ShaRef) { }
    private static DELIMITER = "|"
    serialize(): string {
        return `${this.source.asString()}${JobKey.DELIMITER}${this.ref.serialize()}${JobKey.DELIMITER}${this.sha.sha}`
    }
    toString(): string {
        return `Job: ${this.source} ${this.ref} ${this.sha.sha}`
    }
    static deserialize(serialized: string): JobKey {
        const [source, ref, sha] = serialized.split(JobKey.DELIMITER)
        return new JobKey(RepositorySource.createFromString(source), JobRef.deserialize(ref), Refs.ShaRef.create(sha))
    }
}



const Constants = {
    QUEUE_MAX_FAILURES: 10,
    QUEUE_RESCHEDULE_DURATION: Duration.fromSeconds(10),
    STARTING_MAX_FAILURES: 50,
    STARTING_RESCHEDULE_DURATION: Duration.fromSeconds(10),

    STARTED_MAX_FAILURES: 5,
    STARTED_POLL_DURATION: Duration.fromSeconds(11)
}

export class CynosureJobExecutor implements JobExecutor {

    private processTimer: ReturnType<typeof setTimeout> | undefined

    constructor(private cynosureApiConnectorFactory: CynosureApiConnectorFactory, private taskQueue: TaskQueue.Service) { }

    private listener: JobExecutorListener | null = null

    private static DURATION_NEXT_JOB_POLL = Duration.fromSeconds(10)
    private static DURATION_SLEEP_POLL = Duration.fromSeconds(15)

    private scheduleProcess(wait: Duration) {
        clearTimeout(this.processTimer)
        this.processTimer = setTimeout(() => {
            this.process().then(directReschedule => {
                if (directReschedule) {
                    this.scheduleProcess(CynosureJobExecutor.DURATION_NEXT_JOB_POLL)
                } else {
                    this.scheduleProcess(CynosureJobExecutor.DURATION_SLEEP_POLL)
                }
            })
        }, wait.milliSeconds())
    }

    private process(): Promise<boolean> { // true = direct reschedule, false delayed reschedule
        const listener = this.listener
        if (listener) {
            return this.taskQueue.popExpired(1, Time.now()).then(entries => {
                if (entries.entries.length) {
                    return Promise.all(entries.entries.map(entry => {
                        const key = JobKey.deserialize(entry.uid)
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
                                    return connector.abortActivity(startedState.activityId, key.sha, "")
                                }
                            } else {
                                if (rawQueuedState) {
                                    // Starting queued job
                                    const queuedState = <ProcessingStates.JobQueued>rawQueuedState
                                    const handleError = (e: Error): Promise<void> => {
                                        if (queuedState.failureCount < Constants.QUEUE_MAX_FAILURES) {
                                            logger.warn(`Error: ${e} in QUEUED processing for ${key}. Rescheduling retry ${queuedState.failureCount + 1}/${Constants.QUEUE_MAX_FAILURES}.`)
                                            return this.taskQueue.upsert(entry.uid, Constants.QUEUE_RESCHEDULE_DURATION, new ProcessingStates.JobQueued(queuedState.failureCount + 1).serialize())
                                        } else {
                                            logger.warn(`Error: ${e} in QUEUED processing for ${key}. No more retries of ${Constants.QUEUE_MAX_FAILURES}. Signalling JobError.`)
                                            listener.onJobError(key.source, key.ref, key.sha)
                                            return Promise.resolve()
                                        }
                                    }

                                    return connector.findProductId(key.source.path).then(productId => {
                                        if (productId) {
                                            return connector.startActivity(productId, key.sha).then(activityId => {
                                                logger.info(`Starting Cynosure Activity ${key} -> Product: ${productId} Activity: ${activityId}`)
                                                return this.taskQueue.upsert(entry.uid, Constants.STARTED_POLL_DURATION, new ProcessingStates.JobStarting(productId, 0).serialize())
                                            })
                                        } else {
                                            return handleError(new Error(`Could not find product in Cynosure.`))
                                        }
                                    })
                                } else if (rawStartingState) {
                                    const startingState = <ProcessingStates.JobStarting>rawStartingState

                                    const handleError = (e: Error): Promise<void> => {
                                        if (startingState.failureCount < Constants.STARTING_MAX_FAILURES) {
                                            logger.warn(`Error: ${e} when fetching Cynosure activity for ${key}. Rescheduling retry ${startingState.failureCount + 1}/${Constants.STARTING_MAX_FAILURES}.`)
                                            return this.taskQueue.upsert(entry.uid, Constants.STARTED_POLL_DURATION, new ProcessingStates.JobStarting(startingState.productId, startingState.failureCount + 1).serialize())
                                        } else {
                                            logger.warn(`Error: ${e} when fetching Cynosure activity for ${key}. No more retries of ${Constants.STARTING_MAX_FAILURES}. Signalling JobError.`)
                                            listener.onJobError(key.source, key.ref, key.sha)
                                            return Promise.resolve()
                                        }
                                    }

                                    return connector.findActivity(startingState.productId, key.sha).then(activity => {
                                        if (activity) {
                                            logger.info(`Started Cynosure Activity ${key} -> Product: ${startingState.productId} Activity: ${activity.activityId}`)
                                            listener.onJobStarted(key.source, key.ref, key.sha)
                                            return this.taskQueue.upsert(entry.uid, Constants.STARTED_POLL_DURATION, new ProcessingStates.JobStarted(startingState.productId, activity.activityId, 0).serialize())
                                        } else {
                                            return handleError(new Error(`Could not find activity.`))
                                        }
                                    }).catch(e => {
                                        return handleError(e)
                                    })
                                } else if (rawStartedState) {
                                    const startedState = <ProcessingStates.JobStarted>rawStartedState
                                    const handleError = (e: Error): Promise<void> => {
                                        if (startedState.failureCount < Constants.STARTED_MAX_FAILURES) {
                                            logger.warn(`Error: ${e} in STARTED processing for ${key}. Rescheduling retry ${startedState.failureCount + 1}/${Constants.STARTED_MAX_FAILURES}.`)
                                            return this.taskQueue.upsert(entry.uid, Constants.STARTED_POLL_DURATION, new ProcessingStates.JobStarted(startedState.productId, startedState.activityId, startedState.failureCount + 1).serialize())
                                        } else {
                                            logger.warn(`Error: ${e} in STARTED processing for ${key}. No more retries of ${Constants.QUEUE_MAX_FAILURES}. Signalling JobError.`)
                                            listener.onJobError(key.source, key.ref, key.sha)
                                            return Promise.resolve()
                                        }
                                    }

                                    connector.findActivity(startedState.productId, key.sha).then(activity => {
                                        if (activity) {
                                            logger.debug(`Cynosure activity poll ${key} Cynosure: ${startedState.productId}/${activity.activityId}: State: ${activity.state} Verdict:${activity.verdict}`)
                                            if (activity.state === CynosureProtocol.ActivityState.FINISHED) {
                                                if (activity.verdict === CynosureProtocol.ActivityVerdict.PASSED) {
                                                    listener.onJobSuccess(key.source, key.ref, key.sha)
                                                    return Promise.resolve()
                                                } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ABORTED) {
                                                    logger.debug(`Cynosure aborted job: ${key} Cynosure: ${startedState.productId}/${activity.activityId}`)
                                                    listener.onJobAborted(key.source, key.ref, key.sha)
                                                    return Promise.resolve()
                                                } else if (activity.verdict === CynosureProtocol.ActivityVerdict.FAILED) {
                                                    listener.onJobFailure(key.source, key.ref, key.sha)
                                                    return Promise.resolve()
                                                } else if (activity.verdict === CynosureProtocol.ActivityVerdict.ERRORED) {
                                                    listener.onJobError(key.source, key.ref, key.sha)
                                                    return Promise.resolve()
                                                } else if (activity.verdict === CynosureProtocol.ActivityVerdict.SKIPPED) {
                                                    logger.warn(`Cynosure skipped job: ${key} Cynosure: ${startedState.productId}/${activity.activityId}. No transition for skipped. Sending aborted to queue.`)
                                                    listener.onJobAborted(key.source, key.ref, key.sha)
                                                } else {
                                                    logger.debug(`Unknown final state from Cynosure: ${activity.state}: Signalling error to job. ${key}`)
                                                    listener.onJobError(key.source, key.ref, key.sha)
                                                    return Promise.resolve()
                                                }
                                            } else {
                                                return this.taskQueue.upsert(entry.uid, CynosureJobExecutor.DURATION_NEXT_JOB_POLL, new ProcessingStates.JobStarted(startedState.productId, startedState.activityId, 0).serialize())
                                            }
                                        } else {
                                            return handleError(new Error(`Could not find activity.`))
                                        }
                                    }).catch(e => {
                                        return handleError(e)
                                    })
                                }
                            }
                        } else {
                            logger.debug(`Cynosure API connector not found ${key}. Removing job.`)
                            listener.onJobError(key.source, key.ref, key.sha)
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
            logger.warn("No listener attached to Cynosure Job Executor. Trying soon again.")
            this.scheduleProcess(CynosureJobExecutor.DURATION_SLEEP_POLL)
            return Promise.resolve(false)
        }
    }

    startJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        const key = new JobKey(source, ref, sha)
        return this.taskQueue.upsert(key.serialize(), Duration.NO_DURATION, new ProcessingStates.JobQueued(0).serialize()).finally(() => {
            this.scheduleProcess(Duration.NO_DURATION)
        })
    }
    abortJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        const key = new JobKey(source, ref, sha)
        return this.taskQueue.upsert(key.serialize(), Duration.NO_DURATION, new ProcessingStates.JobAbort("Newer commit.").serialize()).finally(() => {
            this.scheduleProcess(Duration.NO_DURATION)
        })
    }

    setListener(listener: JobExecutorListener): void {
        this.listener = listener
        this.scheduleProcess(Duration.NO_DURATION)
    }
}

export namespace ProcessingStates {


    export abstract class JobState {

        constructor() { }

        protected abstract constructorArgs(): any[]

        serialize(): string {
            return this.constructor.name + ":" + JSON.stringify(this.constructorArgs())
        }

        static deserialize(string: string): JobState {
            const pos = string.indexOf(":")
            const className = string.substring(0, pos)
            const args = <any[]>JSON.parse(string.substring(pos + 1))
            return new ((<any>ProcessingStates)[className])(...args)
        }
    }

    export class JobStarting extends JobState {
        constructor(public readonly productId: string, public readonly failureCount: number) {
            super()
        }

        protected constructorArgs(): any[] {
            return [this.productId, this.failureCount]
        }

    }

    export class JobStarted extends JobState {
        constructor(public readonly productId: string, public readonly activityId: string, public readonly failureCount: number) {
            super()
        }

        protected constructorArgs(): any[] {
            return [this.productId, this.activityId, this.failureCount]
        }

    }

    export class JobQueued extends JobState {
        constructor(public readonly failureCount: number) {
            super()
        }
        protected constructorArgs(): any[] {
            return [this.failureCount]
        }
    }

    export class JobAbort extends JobState {
        public reason: string
        constructor(reason: string) {
            super()
            this.reason = reason
        }
        protected constructorArgs(): any[] {
            return [this.reason]
        }
    }

}
