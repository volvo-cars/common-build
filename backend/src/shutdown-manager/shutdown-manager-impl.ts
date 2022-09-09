import _ from "lodash";
import { createLogger, loggerName } from "../logging/logging-factory";
import { ShutdownManager } from "./shutdown-manager"

const logger = createLogger(loggerName(__filename))

export class ShutdownManagerImpl implements ShutdownManager.Manager {
    private services: ShutdownManager.Service[] = []
    private shutdownCount: number = 0

    register(service: ShutdownManager.Service): void {
        this.services.push(service)
    }
    shutdownAll(): Promise<void> {
        this.shutdownCount++
        if (this.shutdownCount === 1) {
            logger.info(`Shutting down services...`)
            const orderedServices = _.sortBy(this.services, (s) => { return s.shutdownPriority })

            return orderedServices.reduce((acc, s) => {
                return acc.then(() => {
                    logger.info(`Shutting down service ${s.serviceName} (${s.shutdownPriority})`)
                    return s.shutdown()
                        .then(() => {
                            logger.info(`Successfully shut down service ${s.serviceName}`)
                        }).catch((e) => {
                            logger.info(`Failure shut down service ${s.serviceName}: ${e}`)
                        })
                })
            }, Promise.resolve())
        } else {
            logger.debug(`Shutdown invoked ${this.shutdownCount} times. No effect.`)
            return Promise.resolve()
        }
    }
}