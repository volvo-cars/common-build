import { RedisFactory } from "../redis/redis-factory";
import { TaskQueue } from "./task-queue";
import { TaskQueueImpl } from "./task-queue-impl";

export class TaskQueueFactoryImpl implements TaskQueue.Factory {
    constructor(private readonly redisFactory: RedisFactory) { }
    createQueue(id: string): TaskQueue.Service {
        return new TaskQueueImpl(id, this.redisFactory)
    }
}