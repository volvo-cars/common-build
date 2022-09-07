import { RedisFactory } from "../redis/redis-factory"
import { RedisUtils } from "../redis/redis-utils"
import { TaskQueue } from "./task-queue"
import { Duration, Time } from "./time"
import _ from 'lodash'
export class TaskQueueImpl implements TaskQueue.Service {

    private static ENTRY_KEY = "task:entries"
    private static DATA_KEY_PREFIX = "task:data"
    private static DATA_HANDLED_PREFIX = "task:handled"
    private static DATA_TTL_SEC = 60 * 60
    private static HANDLED_TTL_SEC = 120

    constructor(private readonly queueId: string, private readonly redisFactory: RedisFactory) { }

    private getDataKey(uid: string): string {
        return `${TaskQueueImpl.DATA_KEY_PREFIX}:${this.queueId}:${uid}`
    }
    private getHandledKey(uid: string): string {
        return `${TaskQueueImpl.DATA_HANDLED_PREFIX}:${this.queueId}:${uid}`
    }
    upsert(uid: string, wait: Duration, data: string): Promise<void> {
        return this.redisFactory.get().then(client => {
            const dataKey = this.getDataKey(uid)
            return RedisUtils.executeMulti(client.multi()
                .zadd(TaskQueueImpl.ENTRY_KEY, Time.now().addDuration(wait).milliSeconds(), uid)
                .rpush(dataKey, data)
                .expire(dataKey, wait.seconds() + TaskQueueImpl.DATA_TTL_SEC)
                .del(this.getHandledKey(uid))
            ).then(results => {
                return Promise.resolve()
            })
        })
    }

    popExpired(maxCount: number, until: Time): Promise<TaskQueue.Entries> {
        // TODO: Replace by atomic LUA script

        return this.redisFactory.get().then(client => {
            return client.zrange(TaskQueueImpl.ENTRY_KEY, 0, until.seconds(), "BYSCORE", "LIMIT", 0, maxCount).then(uids => {
                if (uids.length) {
                    const multi = uids.reduce((acc, nextUid) => {
                        return acc
                            .lpop(this.getDataKey(nextUid), 99999) //Empty the whole data list
                            .set(this.getHandledKey(nextUid), "dummy", "EX", until.seconds() + TaskQueueImpl.HANDLED_TTL_SEC, "NX")
                    }, client.multi()).zrem(TaskQueueImpl.ENTRY_KEY, ...uids)
                    return RedisUtils.executeMulti(multi).then(result => {
                        const entries = _.range(0, uids.length).flatMap(index => {
                            const uid = uids[index]
                            const data = result[index * 2] || ""
                            const toBeHandled = result[index * 2 + 1] === "OK"
                            if (toBeHandled) {
                                return [new TaskQueue.Entry(uid, data)]
                            } else {
                                return []
                            }
                        })
                        return Promise.resolve(new TaskQueue.Entries(entries, entries.length !== uids.length || uids.length === maxCount))
                    })
                } else {
                    return Promise.resolve(new TaskQueue.Entries([], false))
                }
            })
        })

    }
}