import Redis, { RedisOptions } from 'ioredis';

export class RedisConfig {
    constructor(public readonly host: string, public readonly user: string | undefined, public readonly password: string | undefined, public readonly port: number | undefined) { }

    toString(): string {
        return `Redis host:${this.host} user:${this.user || "undefined"} password:${this.password ? "*****" : "undefined"} user:${this.port || "undefined"}`
    }
}

export interface RedisFactory {
    get(): Promise<Redis>

    shutdown(): Promise<void>
}

export class RedisFactoryImpl implements RedisFactory {
    private client: Redis
    constructor(config: RedisConfig) {
        this.client = new Redis(<RedisOptions>{
            host: config.host,
            username: config.user,
            password: config.password,
            port: config.port
        })
    }

    async get(): Promise<Redis> {
        return Promise.resolve(this.client)
    }

    async shutdown(): Promise<void> {
        return this.client.quit().then(_ => { return })
    }
}

export const createForTest = (): RedisFactory => {
    return new RedisFactoryImpl(new RedisConfig("redis", undefined, undefined, undefined))
}