import { RedisFactory } from "../../redis/redis-factory";
import { RedisLua } from "../../redis/redis-lua";
import { JobExecutor } from "../job-executor/job-executor";
import { Time } from "../time";



export namespace QueueRedis {

    export class PushResult {
        constructor(public localQueueSize: number, public cancel: JobExecutor.Key | undefined, public abort: JobExecutor.Key | undefined) { }
    }

    export interface Service {

        push(job: JobExecutor.Key): Promise<PushResult>

        start(maxCount: number): Promise<JobExecutor.Key[]>

        complete(job: JobExecutor.Key): Promise<boolean>
    }
}
