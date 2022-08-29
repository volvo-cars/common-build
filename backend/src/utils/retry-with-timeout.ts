import { createLogger, loggerName } from "../logging/logging-factory"

const logger = createLogger(loggerName(__filename))

export const RETRY = "__This_should_be_retried__"

/**
 * 
 * @param f promise creator
 * @param timeout total timeout in seconds
 * @param interval interval time for retry in seconds
 * @returns 
 */
export const retryWithTimeout = <T>(f: () => Promise<T | null>, description: string, timeout: number, interval: number): Promise<T> => {
    const startTime = (new Date()).getTime()
    return f().then(result => {
        if (result === null) {
            return new Promise<T>((resolve, reject) => {
                let retryCount = 1
                const poller = setInterval(() => {
                    logger.info(`Retry ${retryCount} for "${description}"`)
                    f().then(result => {
                        if (result !== null) {
                            clearInterval(poller)
                            resolve(result)
                        } else {
                            retryCount++
                            const now = (new Date().getTime())
                            if ((now - startTime) > timeout * 1000) {
                                clearInterval(poller)
                                reject(new Error(`Could not complete "${description}" in ${timeout} seconds.`))
                            }
                        }
                    }).catch(e => { reject(e) })
                }, interval * 1000)
            })
        } else {
            return Promise.resolve(result)
        }
    })
}