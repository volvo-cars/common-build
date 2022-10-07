import { RedisFactory } from "../../redis/redis-factory";
import { RedisLua } from "../../redis/redis-lua";
import { JobExecutor } from "../job-executor/job-executor";
import { TimeProvider } from "../time";
import { QueueRedis } from "./queue-redis";

const getLocalQueueKey = (job: JobExecutor.Key): string => { return `queue:${job.source.asString()}:local:${job.jobRef.queueId.id}` }

const getGlobalReadyQueueKey = (): string => {
    return `queue:ready`
}
const getGlobalActiveQueueKey = (): string => {
    return `queue:active`
}


export class QueueRedisImpl implements QueueRedis.Service {

    private invoker: Promise<RedisLua.Invoker>

    constructor(redisFactory: RedisFactory, private time: TimeProvider, debug: boolean = false) {
        this.invoker = redisFactory.get().then(client => {
            return RedisLua.create(client, debug, ...[{ name: "push", keyCount: 3 }, { name: "start", keyCount: 2 }, { name: "complete", keyCount: 3 }].map(s => { return RedisLua.Script.fromPath(s.name, s.keyCount, `./lua/${s.name}.lua`) }))
        })
    }

    push(job: JobExecutor.Key): Promise<QueueRedis.PushResult> {
        const localQueueKey = getLocalQueueKey(job)
        const globalReadyQueueKey = getGlobalReadyQueueKey()
        const globalActiveQueueKey = getGlobalActiveQueueKey()

        return this.invoker.then(invoker => {
            return invoker.invokeScript<[number, string | undefined, string | undefined]>("push", localQueueKey, globalReadyQueueKey, globalActiveQueueKey, job.serialize(), job.jobRef.canonicalId, this.time.get()).then(([localQueueSize, serializedCancel, serializedAbort]) => {
                return new QueueRedis.PushResult(localQueueSize, serializedCancel ? JobExecutor.Key.deserialize(serializedCancel) : undefined, serializedAbort ? JobExecutor.Key.deserialize(serializedAbort) : undefined)
            })
        })
    }

    start(maxCount: number): Promise<JobExecutor.Key[]> {
        if (maxCount > 0) {
            const globalReadyQueueKey = getGlobalReadyQueueKey()
            const globalActiveQueueKey = getGlobalActiveQueueKey()
            return this.invoker.then(invoker => {
                return invoker.invokeScript<string[]>("start", globalReadyQueueKey, globalActiveQueueKey, maxCount).then((serialized) => {
                    return serialized.map(s => { return JobExecutor.Key.deserialize(s) })
                })
            })
        } else {
            return Promise.resolve([])
        }
    }

    complete(job: JobExecutor.Key): Promise<boolean> {
        const globalReadyQueueKey = getGlobalReadyQueueKey()
        const globalActiveQueueKey = getGlobalActiveQueueKey()
        const localQueueKey = getLocalQueueKey(job)
        return this.invoker.then(invoker => {
            return invoker.invokeScript<"completed" | "not_active">("complete", localQueueKey, globalReadyQueueKey, globalActiveQueueKey, job.serialize()).then((result) => {
                return "completed" === result
            })
        })
    }
}
