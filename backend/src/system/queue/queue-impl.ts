import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";
import { RedisUtils } from '../../redis/redis-utils';
import { Duration } from '../../task-queue/time';
import { JobExecutor } from '../job-executor/job-executor';
import { TimeProvider } from "../time";
import { Queue } from "./queue";
import { QueueRedis } from "./queue-redis";
import { QueueRedisImpl } from "./queue-redis-impl";

const logger = createLogger(loggerName(__filename))

const Const = {
    STATUS_TTL: Duration.fromHours(48)
}

export class QueueImpl implements Queue.Service {

    private queueRedis: QueueRedis.Service

    constructor(private redisFactory: RedisFactory, time: TimeProvider, private listener: Queue.Listener, debug: boolean = false) {
        this.queueRedis = new QueueRedisImpl(redisFactory, time, debug)
    }

    private jobStatusKey(job: JobExecutor.Key): string {
        return `queue:status:${job.serialize()}`
    }

    private setState(newStatus: Queue.State, ...jobs: JobExecutor.Key[]): Promise<void> {
        if (jobs.length) {
            return this.redisFactory.get().then(client => {
                const tx = jobs.reduce((acc, job) => {
                    acc.set(this.jobStatusKey(job), newStatus, "EX", Const.STATUS_TTL.seconds(), "GET")
                    return acc
                }, client.multi())
                return RedisUtils.executeMulti(tx).then(result => {
                    setTimeout(() => {
                        result.forEach((oldStatus, index) => {
                            this.listener.onQueueTransition(jobs[index], newStatus, <Queue.State>oldStatus)
                        })
                    }, 0)
                })
            })
        } else {
            return Promise.resolve()
        }
    }
    getState(job: JobExecutor.Key): Promise<Queue.State | undefined> {
        return this.redisFactory.get().then(client => {
            return client.get(this.jobStatusKey(job)).then(result => {
                return result ? <Queue.State>result : undefined
            })
        })
    }

    start(maxCount: number): Promise<JobExecutor.Key[]> {
        return this.queueRedis.start(maxCount).then(started => {
            return this.setState(Queue.State.STARTING, ...started).then(() => {
                return started
            })
        })
    }
    push(job: JobExecutor.Key): Promise<void> {
        return this.queueRedis.push(job).then(result => {
            return this.setState(Queue.State.QUEUED, job).then(() => {
                const cancelAbortOps = [result.abort ? [this.setState(Queue.State.ABORTED, result.abort)] : [], result.cancel ? [this.setState(Queue.State.CANCELLED, result.cancel)] : []].flat()
                return Promise.all(cancelAbortOps).then()
            })
        })
    }
    addState(job: JobExecutor.Key, newState: Queue.State): Promise<boolean> {
        return this.getState(job).then(state => {
            if (state) {
                if (Queue.isTransitionValid(state, newState)) {
                    if (Queue.isStateTerminal(newState)) {
                        return this.queueRedis.complete(job).then(markedCompleted => {
                            if (!markedCompleted) {
                                logger.error(`Completion in RedisQueue returned false for ${job.toString()}`)
                            }
                            return this.setState(newState, job).then(() => {
                                return true
                            })
                        })
                    } else {
                        return this.setState(newState, job).then(() => {
                            return false
                        })
                    }
                } else {
                    return Promise.reject(new Error(`State transition ${state}->${newState} is illegal (${job.toString()}).`))
                }
            } else {
                return Promise.reject()
            }
        })
    }
}

