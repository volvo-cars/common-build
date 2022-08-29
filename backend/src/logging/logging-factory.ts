import _ from 'lodash'
import { pino } from 'pino'

export interface Logger {
    info(msg: string, ...args: any[]): void
    debug(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
}

export const createLogger = (name?: string): Logger => {
    let definedName = name || "unknown"

    return pino({
        level: 'debug',
        name: definedName
    })
}

export const loggerName = (path: string, count: number = 1): string => {
    return _.takeRight(path.split('/'), count).join("/")
}


