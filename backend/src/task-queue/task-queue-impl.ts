import { RedisFactory } from "../redis/redis-factory"
import { RedisUtils } from "../redis/redis-utils"
import { TaskQueue } from "./task-queue"
import { Duration, Time } from "./time"
import _ from 'lodash'

const Const = {
    ENTRY_KEY: "task:entries",
    DATA_KEY_PREFIX: "task:data",
    DATA_HANDLED_PREFIX: "task:handled",
    DATA_TTL: Duration.fromMinutes(60),
    HANDLED_TTL: Duration.fromSeconds(120)
}

export class TaskQueueImpl implements TaskQueue.Service {

    constructor(private readonly queueId: string, private readonly redisFactory: RedisFactory) { }

    private getDataKey(uid: string): string {
        return `${Const.DATA_KEY_PREFIX}:${this.queueId}:${uid}`
    }
    private getHandledKey(uid: string): string {
        return `${Const.DATA_HANDLED_PREFIX}:${this.queueId}:${uid}`
    }

    private getEntryKey(): string {
        return `${Const.ENTRY_KEY}:${this.queueId}`
    }


    upsert(uid: string, wait: Duration, data: string): Promise<void> {
        return this.redisFactory.get().then(client => {
            const dataKey = this.getDataKey(uid)
            const entryKey = this.getEntryKey()
            return RedisUtils.executeMulti(client.multi()
                .zadd(entryKey, Time.now().addDuration(wait).milliSeconds(), uid)
                .rpush(dataKey, data)
                .expire(dataKey, wait.add(Const.DATA_TTL).seconds())
                .del(this.getHandledKey(uid))
            ).then(results => {
                return Promise.resolve()
            })
        })
    }

    popExpired(maxCount: number, until: Time): Promise<TaskQueue.Entries> {
        // TODO: Replace by atomic LUA script

        return this.redisFactory.get().then(client => {
            const entryKey = this.getEntryKey()
            return client.zrange(entryKey, 0, until.milliSeconds(), "BYSCORE", "LIMIT", 0, maxCount).then(uids => {
                if (uids.length) {
                    const multi = uids.reduce((acc, nextUid) => {
                        return acc
                            .lpop(this.getDataKey(nextUid), 999999) //Empty the whole data list
                            .set(this.getHandledKey(nextUid), "dummy", "EX", Const.HANDLED_TTL.seconds(), "NX")
                    }, client.multi()).zrem(entryKey, ...uids)
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