
export interface Logger {
    info(msg: string, ...args: any[]): void
    debug(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
}

export const createLogger = (name?: string): Logger => {
    return new LoggerImpl(name || "default")
}

class LoggerImpl implements Logger {
    constructor(private name: string) { }
    info(msg: string, ...args: any[]): void {
        console.log(msg, args)
    }
    debug(msg: string, ...args: any[]): void {
        console.debug(msg, args)
    }
    error(msg: string, ...args: any[]): void {
        console.error(msg, args)
    }
    warn(msg: string, ...args: any[]): void {
        console.warn(msg, args)
    }

}




