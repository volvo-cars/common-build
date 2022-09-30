import { ChainableCommander } from "ioredis/built/utils/RedisCommander";
import _ from 'lodash';
import { SystemConfig } from '../../config/system-config';
import { JobRef } from '../../domain-model/job-ref/job-ref';
import { RepositorySource } from '../../domain-model/repository-model/repository-source';
import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";
import { RedisUtils } from '../../redis/redis-utils';
import { BranchName, Update } from "../build-system";
import { createExecutionSerializer, ExecutionSerializer } from '../execution-serializer';
import { JobExecutor } from "../job-executor/job-executor";
import { Time } from "../time";
import { ActiveBuildState } from "./active-build-state";
import { BuildState } from './build-state';

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
    onQueueUpdated(source: RepositorySource, ref: JobRef.Ref, buildState: BuildState): void
}

export interface Queue {
    upsert(update: Update): Promise<void>
    addStatus(source: RepositorySource, ref: JobRef.Ref, status: QueueStatus): Promise<void>
    getStatus(source: RepositorySource, ref: JobRef.Ref): Promise<BuildState | undefined>
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

    private getCurrentKey(source: RepositorySource, refKey: JobRef.Key): string {
        return `current:{${source.id}:${source.path}}:${refKey.id}`
    }

    private getJobRefSemaphore(source: RepositorySource, refKey: JobRef.Key): string {
        return `serial:{${source.id}:${source.path}}:${refKey.id}`
    }

    private calculateProcessRefTimeKey(source: RepositorySource, refKey: JobRef.Key): string {
        return `time:{${source.id}:${source.path}}:${refKey.id}`
    }

    async upsert(update: Update): Promise<void> {
        const ref = new JobRef.UpdateRef(update.id, update.sha)
        return this.upsertRef(update.source, ref, update.target)
    }

    private upsertRef(source: RepositorySource, ref: JobRef.UpdateRef, targetBranchName: BranchName): Promise<void> {
        return this.redis.get().then(async client => {
            const processingQueueName = this.calculateProcessingQueue(source, targetBranchName)
            const currentKey = this.getCurrentKey(source, ref.key())
            const current = await client.get(currentKey)
            const existingState = current ? ActiveBuildState.deserialize(current) : undefined
            if (!existingState || !existingState.sha.equals(ref.sha)) {
                const buildState = BuildState.create(QueueStatus.QUEUED, this.time.get())
                logger.info(`Adding for processing ${source}/${ref} to ${processingQueueName}`)
                const jobKey = new JobExecutor.Key(source, ref)
                await RedisUtils.executeMulti(client.multi()
                    .set(this.calculateProcessRefTimeKey(source, ref.key()), this.time.get(), "EX", QueueImpl.refTimeTTL) // Store time for update. Used to add new priority among queues.
                    .zadd(QueueImpl.scheduledQueues, "NX", this.time.get(), processingQueueName) // Only add if not existing yet / preserve first entry's prio by time.
                    .zadd(processingQueueName, this.time.get(), jobKey.serialize())
                    .set(currentKey, ActiveBuildState.create(ref.sha, buildState, targetBranchName).serialize())
                )
                if (existingState) {
                    const status = existingState.buildState.current().status
                    const existingRef = ref.withSha(existingState.sha)
                    this.queueListener.onQueueUpdated(source, existingRef, existingState.buildState.push(status === QueueStatus.QUEUED ? QueueStatus.CANCELLED : QueueStatus.ABORTED, this.time.get()))
                    if (status !== QueueStatus.QUEUED) {
                        await client.zrem(QueueImpl.inactiveQueues, processingQueueName)
                    }
                }

                this.queueListener.onQueueUpdated(source, ref, buildState)
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

            const topProcessingQueues = (await RedisUtils.executeMulti(client.multi()
                .zdiffstore(intermediateSetName, 2, QueueImpl.scheduledQueues, QueueImpl.inactiveQueues)
                .zpopmin(intermediateSetName, maxCount)
                .del(intermediateSetName)
            ))[1] as string[]
            if (topProcessingQueues.length) {
                logger.debug(`Processing queues: ${topProcessingQueues.join(",")}`)

                const maybeNextProcessingValues = <string[]>_.map(_.initial((await _.reduce(topProcessingQueues, (acc: ChainableCommander, processingQueue: string) => {
                    acc.zpopmin(processingQueue)
                    return acc
                }, client.multi()).zrem(QueueImpl.scheduledQueues, ...topProcessingQueues).exec())), entry => { return _.first(<string[]>_.nth(entry, 1)) })

                const started = await Promise.all(topProcessingQueues.map(async (processingQueueName, index) => {
                    let value = _.nth(maybeNextProcessingValues, index)
                    if (value) {
                        const jobKey = JobExecutor.Key.deserialize(value)
                        const currentKey = this.getCurrentKey(jobKey.source, jobKey.jobRef.key())
                        const currentValue = await client.get(currentKey)
                        if (currentValue) {
                            const currentState = ActiveBuildState.deserialize(currentValue)
                            if (currentState.buildState.current().status === QueueStatus.QUEUED) {
                                logger.debug(`Starting queue: ${processingQueueName} ${jobKey}`)
                                const newBuildState = currentState.buildState.push(QueueStatus.STARTING, this.time.get())
                                const newActiveState = ActiveBuildState.create(currentState.sha, newBuildState, currentState.targetBranch)
                                await client.multi()
                                    .set(currentKey, newActiveState.serialize())
                                    .zadd(QueueImpl.inactiveQueues, 0, processingQueueName)
                                    .exec()
                                this.queueListener.onQueueUpdated(jobKey.source, jobKey.jobRef, newBuildState)
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

    async getStatus(source: RepositorySource, ref: JobRef.Ref): Promise<BuildState | undefined> {
        const cmd = () => {
            return this.redis.get().then(async client => {
                const currentKey = this.getCurrentKey(source, ref.key())
                return client.get(currentKey).then(raw => {
                    if (raw) {
                        const state = ActiveBuildState.deserialize(raw)
                        return state.sha.equals(ref.sha) ? state.buildState : undefined
                    }
                    return undefined
                })
            })
        }
        return this.serializer.execute(this.getJobRefSemaphore(source, ref.key()), cmd)
    }


    async addStatus(source: RepositorySource, ref: JobRef.Ref, status: QueueStatus): Promise<void> {
        let cmd = () => {
            return this.redis.get().then(async client => {
                const currentKey = this.getCurrentKey(source, ref.key())
                return client.get(currentKey).then(async raw => {
                    if (raw) {
                        const activeState = ActiveBuildState.deserialize(raw)
                        if (activeState.sha.equals(ref.sha)) {
                            const newBuildState = activeState.buildState.push(status, this.time.get())
                            const processingQueueName = this.calculateProcessingQueue(source, activeState.targetBranch)
                            if (queueStatusTerminal(status)) {
                                logger.debug(`Terminal ${source} ${ref.serialize()} ${status}`)
                                const nextRefValue = <string | undefined>_.first(<string[]>_.nth(await RedisUtils.executeMulti(client.multi()
                                    .zrange(processingQueueName, 0, Number.MAX_VALUE, "BYSCORE", "LIMIT", 0, 1)
                                    .del(currentKey)
                                    .zrem(QueueImpl.inactiveQueues, processingQueueName)
                                ), 0))
                                if (nextRefValue) {
                                    const jobKey = JobExecutor.Key.deserialize(nextRefValue)
                                    const queueProcessingPrio = (await client.get(this.calculateProcessRefTimeKey(source, jobKey.jobRef.key()))) || this.time.get()
                                    await client.zadd(QueueImpl.scheduledQueues, queueProcessingPrio, processingQueueName)
                                } else {
                                    await client.zrem(QueueImpl.scheduledQueues, processingQueueName)
                                }
                                this.queueListener.onQueueUpdated(source, ref, newBuildState)
                                return this.start(1)
                            } else {
                                await client.set(currentKey, ActiveBuildState.create(ref.sha, newBuildState, activeState.targetBranch).serialize())
                                this.queueListener.onQueueUpdated(source, ref, newBuildState)
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
        return this.serializer.execute(this.getJobRefSemaphore(source, ref.key()), cmd)
    }
}

export const buildQueue = (redis: RedisFactory, time: Time, queueListener: QueueListener, config: SystemConfig.Engine): Queue => {
    return new QueueImpl(redis, time, queueListener, config)
}