import _ from 'lodash'
import { RedisFactory } from "../redis/redis-factory"
import { RedisUtils } from "../redis/redis-utils"
import { Duration, Time } from "./time"
export namespace TaskQueue {

    export interface Service {
        upsert(uid: string, wait: Duration, data: string): Promise<void>
        popExpired(maxCount: number, since: Time): Promise<Entries>
    }

    export interface Factory {
        createQueue(id: string): TaskQueue.Service
    }

    export class Entries {
        constructor(public readonly entries: Entry[], public readonly hasMore: boolean) { }
    }

    export class Entry {
        constructor(public readonly uid: string, public readonly data: string[]) { }
    }
}



