import { createLogger, loggerName } from "../logging/logging-factory";
import { RedisFactory } from "../redis/redis-factory";

export interface ExecutionSerializer {
    /**
     * 
     * @param semaphore A unique value that will controller serialized access.
     * @param f The function to execute
     */
    execute<T>(semaphore: string, f: () => Promise<T>): Promise<T>
}

const logger = createLogger(loggerName(__filename))
class ExecutionSerializerImpl implements ExecutionSerializer {

    private lastPromiseByKey: Map<string, Promise<any>> = new Map()

    constructor() {

    }

    async execute<T>(semaphore: string, f: () => Promise<T>): Promise<T> {
        const key = `semaphore:${semaphore}`

        const lastPromise = this.lastPromiseByKey.get(key)

        const newPromise = new Promise<T>((resolve, reject) => {
            if (lastPromise) {
                lastPromise.finally(() => {
                    f().then(resolve).catch(reject)
                })
            } else {
                f().then(resolve).catch(reject)
            }
        })
        this.lastPromiseByKey.set(key, newPromise)
        return newPromise
    }
}

export const createExecutionSerializer = (): ExecutionSerializer => {
    return new ExecutionSerializerImpl()
}