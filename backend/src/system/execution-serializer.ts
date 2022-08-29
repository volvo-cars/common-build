import { createLogger, loggerName } from "../logging/logging-factory";

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

    private lastRegisteredBySemaphore: Map<string, Promise<any>> = new Map()

    constructor() { }

    async execute<T>(semaphore: string, f: () => Promise<T>): Promise<T> {
        const key = `semaphore:${semaphore}`

        const preparePromise = (): Promise<T> => {
            const maybeLastRegistered = this.lastRegisteredBySemaphore.get(key)
            if (maybeLastRegistered) {
                let lastRegistered = maybeLastRegistered
                return new Promise<T>((resolve, reject) => {
                    lastRegistered.finally(() => {
                        f().then(resolve).catch(reject)
                    })
                })
            } else {
                return f()
            }
        }
        let preparedPromise = preparePromise()
        this.lastRegisteredBySemaphore.set(key, preparedPromise)
        preparedPromise.finally(() => {
            if (preparedPromise === this.lastRegisteredBySemaphore.get(key)) {
                this.lastRegisteredBySemaphore.delete(key)
            }
        })
        return preparedPromise
    }
}

export const createExecutionSerializer = (): ExecutionSerializer => {
    return new ExecutionSerializerImpl()
}