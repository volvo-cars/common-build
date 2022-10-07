import { RedisFactory } from "../redis/redis-factory";
import { TimeProvider } from "../system/time";
import { TaskQueue } from "./task-queue";
import { TaskQueueImpl } from "./task-queue-impl";

export class TaskQueueFactoryImpl implements TaskQueue.Factory {
    constructor(private readonly redisFactory: RedisFactory, private readonly timeProvider: TimeProvider) { }
    createQueue(id: string): TaskQueue.Service {
        return new TaskQueueImpl(id, this.redisFactory, this.timeProvider)
    }
}