import _ from 'lodash'
import { ChainableCommander } from "ioredis/built/utils/RedisCommander";
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { BranchName, Update } from "../build-system"
import { Time } from "../time"
import { BuildState } from './build-state'
import { ActiveBuildState } from "./active-build-state"
import { JobRef, JobRefType } from '../job-executor/job-ref'
import { createExecutionSerializer, ExecutionSerializer } from '../execution-serializer'
import { SystemConfig } from '../../config/system-config';
import { deserializeQueueValue, serializeQueueValue } from './queue-value-util';
import { RedisUtils } from '../../redis/redis-utils';
import { Refs } from '../../domain-model/refs';
import { RepositorySource } from '../../domain-model/repository-model/repository-source';

const logger = createLogger(loggerName(__filename))

export enum QueueStatus {
    QUEUED = "queued",
    STARTING = "starting",
    STARTED = "started",
    CANCELLED = "cancelled",
    SUCCEESS = "success",
    FAILURE = "failure", //Logical build failure
    ABORTED = "aborted",
    ERROR = "error", // Infrastructural error (not a build failure)
    TIMEOUT = "timeout", // Expected signals not arriving to Queue within timeout setting,
    CONFLICT = "conflict",
    DEPENDENCY = "dependency"
}

export const QueueStatusTransitions: Record<QueueStatus, QueueStatus[]> = {
    [QueueStatus.QUEUED]: [QueueStatus.STARTING, QueueStatus.CANCELLED],
    [QueueStatus.STARTING]: [QueueStatus.CONFLICT, QueueStatus.ABORTED, QueueStatus.STARTED, QueueStatus.ERROR, QueueStatus.TIMEOUT, QueueStatus.FAILURE, QueueStatus.ABORTED, QueueStatus.DEPENDENCY], //FAILURE: Rebase failed, ABORTED: Rebase OK (will come another rebase)
    [QueueStatus.STARTED]: [QueueStatus.ABORTED, QueueStatus.FAILURE, QueueStatus.SUCCEESS, QueueStatus.ERROR, QueueStatus.TIMEOUT],
    [QueueStatus.SUCCEESS]: [],
    [QueueStatus.FAILURE]: [],
    [QueueStatus.ABORTED]: [],
    [QueueStatus.CANCELLED]: [],
    [QueueStatus.ERROR]: [],
    [QueueStatus.TIMEOUT]: [],
    [QueueStatus.CONFLICT]: [],
    [QueueStatus.DEPENDENCY]: []
}

export const queueStatusTerminal = (status: QueueStatus): boolean => {
    return QueueStatusTransitions[status].length === 0
}

export interface QueueListener {
    onQueueUpdated(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, buildState: BuildState): void
}

export interface Queue {
    upsert(update: Update): Promise<void>
    addStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, status: QueueStatus): Promise<void>
    getStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<BuildState | null>
}

type ProcessingQueueName = string

export class QueueImpl {
    private static scheduledQueues = "scheduled-queues"
    private static inactiveQueues = "inactive-queues"
    private static refTimeTTL = 1 * 60 * 60

    private redis: RedisFactory
    private time: Time
    private queueListener: QueueListener
    private serializer: ExecutionSerializer
    private config: SystemConfig.Engine
    constructor(redis: RedisFactory, time: Time, queueListener: QueueListener, config: SystemConfig.Engine) {
        this.redis = redis
        this.time = time
        this.queueListener = queueListener
        this.config = config
        this.serializer = createExecutionSerializer()
    }

    private calculateProcessingQueue(source: RepositorySource, target: BranchName): ProcessingQueueName {
        return `processing-queue:{${source.id}:${source.path}}:${target}`
    }

    private getCurrentKey(source: RepositorySource, ref: JobRef): string {
        return `current:{${source.id}:${source.path}}:${ref.serialize()}`
    }

    private getJobRefSemaphore(source: RepositorySource, ref: JobRef): string {
        return `serial:{${source.id}:${source.path}}:${ref.serialize()}`
    }

    private calculateProcessRefTimeKey(source: RepositorySource, ref: JobRef): string {
        return `time:{${source.id}:${source.path}}:${ref.serialize()}`
    }

    async upsert(update: Update): Promise<void> {
        const ref = JobRef.create(JobRefType.UPDATE, update.id)
        return this.upsertRef(update.source, ref, update.sha, update.target)
    }

    private upsertRef(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, targetBranchName: BranchName): Promise<void> {
        return this.redis.get().then(async client => {
            const processingQueueName = this.calculateProcessingQueue(source, targetBranchName)
            const currentKey = this.getCurrentKey(source, ref)
            const current = await client.get(currentKey)
            const existingState = current ? ActiveBuildState.deserialize(current) : null
            if (!existingState || existingState.sha.sha !== sha.sha) {
                const buildState = BuildState.create(QueueStatus.QUEUED, this.time.get())
                logger.info(`Adding for processing ${source.id}/${source.path}/${sha} ${ref.serialize()} to ${processingQueueName}`)
                await client.multi()
                    .set(this.calculateProcessRefTimeKey(source, ref), this.time.get(), "EX", QueueImpl.refTimeTTL) // Store time for update. Used to add new priority among queues.
                    .zadd(QueueImpl.scheduledQueues, "NX", this.time.get(), processingQueueName) // Only add if not existing yet / preserve first entry's prio by time.
                    .zadd(processingQueueName, this.time.get(), serializeQueueValue(source, ref))
                    .set(currentKey, ActiveBuildState.create(sha, buildState, targetBranchName).serialize())
                    .exec()

                if (existingState) {
                    const status = existingState.buildState.current().status
                    this.queueListener.onQueueUpdated(source, ref, existingState.sha, existingState.buildState.push(status === QueueStatus.QUEUED ? QueueStatus.CANCELLED : QueueStatus.ABORTED, this.time.get()))
                    if (status !== QueueStatus.QUEUED) {
                        await client.zrem(QueueImpl.inactiveQueues, processingQueueName)
                    }
                }

                this.queueListener.onQueueUpdated(source, ref, sha, buildState)
                return this.start(1)
            } else {
                return Promise.resolve()
            }
        })
    }

    /**
     * Processes all 
     * @param maxCount the maximum number of started processing 
     * @returns the number or queued items started
     */
    private async start(maxCount: number): Promise<void> {
        return this.redis.get().then(async (client) => {
            const intermediateSetName = "temp-actives-without-inactives"
            //Change to RedisUtils.execMulti (Everywhere)
            const topProcessingQueues = _.filter(<string[]>_.nth(_.map((await client.multi()
                .zdiffstore(intermediateSetName, 2, QueueImpl.scheduledQueues, QueueImpl.inactiveQueues)
                .zpopmin(intermediateSetName, maxCount)
                .del(intermediateSetName)
                .exec()), entry => { return _.nth(entry, 1) }), 1), (__, index) => { return index % 2 === 0 })

            if (topProcessingQueues.length) {
                logger.debug(`Processing queues: ${topProcessingQueues.join(",")}`)

                const maybeNextProcessingValues = <string[]>_.map(_.initial((await _.reduce(topProcessingQueues, (acc: ChainableCommander, processingQueue: string) => {
                    acc.zpopmin(processingQueue)
                    return acc
                }, client.multi()).zrem(QueueImpl.scheduledQueues, ...topProcessingQueues).exec())), entry => { return _.first(<string[]>_.nth(entry, 1)) })

                const started = await Promise.all(topProcessingQueues.map(async (processingQueueName, index) => {
                    let value = _.nth(maybeNextProcessingValues, index)
                    if (value) {
                        const [source, ref] = deserializeQueueValue(value)
                        const currentKey = this.getCurrentKey(source, ref)
                        const currentValue = await client.get(currentKey)
                        if (currentValue) {
                            const currentState = ActiveBuildState.deserialize(currentValue)
                            if (currentState.buildState.current().status === QueueStatus.QUEUED) {
                                logger.debug(`Starting: Queue:${processingQueueName} ${ref.serialize()} ${currentState.sha}`)
                                const newBuildState = currentState.buildState.push(QueueStatus.STARTING, this.time.get())
                                const newActiveState = ActiveBuildState.create(currentState.sha, newBuildState, currentState.targetBranch)
                                await client.multi()
                                    .set(currentKey, newActiveState.serialize())
                                    .zadd(QueueImpl.inactiveQueues, 0, processingQueueName)
                                    .exec()
                                this.queueListener.onQueueUpdated(source, ref, currentState.sha, newBuildState)
                                return Promise.resolve(1)
                            } else {
                                return Promise.resolve(0)
                            }
                        } else {
                            return Promise.resolve(0)
                        }
                    } else {
                        await client.zrem(QueueImpl.scheduledQueues, processingQueueName)
                        return Promise.resolve(0)
                    }
                }))
                return Promise.resolve()
            } else {
                logger.debug("Skipping. No active rebase queues.")
            }
            return Promise.resolve()
        })
    }

    async getStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<BuildState | null> {
        const cmd = () => {
            return this.redis.get().then(async client => {
                const currentKey = this.getCurrentKey(source, ref)
                return client.get(currentKey).then(raw => {
                    if (raw) {
                        const state = ActiveBuildState.deserialize(raw)
                        return state.sha.sha === sha.sha ? state.buildState : null
                    }
                    return null
                })
            })
        }
        return this.serializer.execute(this.getJobRefSemaphore(source, ref), cmd)
    }


    async addStatus(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, status: QueueStatus): Promise<void> {
        let cmd = () => {
            return this.redis.get().then(async client => {
                const currentKey = this.getCurrentKey(source, ref)
                return client.get(currentKey).then(async raw => {
                    if (raw) {
                        const activeState = ActiveBuildState.deserialize(raw)
                        if (activeState.sha.sha === sha.sha) {
                            const newBuildState = activeState.buildState.push(status, this.time.get())
                            const processingQueueName = this.calculateProcessingQueue(source, activeState.targetBranch)
                            if (queueStatusTerminal(status)) {
                                logger.debug(`Terminal ${source.id}/${source.path} ${ref.serialize()} ${sha} ${status}`)
                                const nextRefValue = <string | undefined>_.first(<string[]>_.nth(await RedisUtils.executeMulti(client.multi()
                                    .zrange(processingQueueName, 0, Number.MAX_VALUE, "BYSCORE", "LIMIT", 0, 1)
                                    .del(currentKey)
                                    .zrem(QueueImpl.inactiveQueues, processingQueueName)
                                ), 0))
                                if (nextRefValue) {
                                    const [source, ref] = deserializeQueueValue(nextRefValue)
                                    const queueProcessingPrio = (await client.get(this.calculateProcessRefTimeKey(source, ref))) || this.time.get()
                                    await client.zadd(QueueImpl.scheduledQueues, queueProcessingPrio, processingQueueName)
                                } else {
                                    await client.zrem(QueueImpl.scheduledQueues, processingQueueName)
                                }
                                this.queueListener.onQueueUpdated(source, ref, sha, newBuildState)
                                return this.start(1)
                            } else {
                                await client.set(currentKey, ActiveBuildState.create(sha, newBuildState, activeState.targetBranch).serialize())
                                this.queueListener.onQueueUpdated(source, ref, sha, newBuildState)
                                return Promise.resolve()
                            }
                        } else {
                            return Promise.resolve()
                        }
                    } else {
                        return Promise.resolve()
                    }
                })
            })
        }
        return this.serializer.execute(this.getJobRefSemaphore(source, ref), cmd)
    }
}

export const buildQueue = (redis: RedisFactory, time: Time, queueListener: QueueListener, config: SystemConfig.Engine): Queue => {
    return new QueueImpl(redis, time, queueListener, config)
}