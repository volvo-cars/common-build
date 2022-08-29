import Redis, { RedisOptions } from 'ioredis';
import { SystemConfig } from '../config/system-config';



export class RedisFactory {
    private client: Redis
    constructor(options: RedisOptions) {
        this.client = new Redis(options)
    }

    async get(): Promise<Redis> {
        return Promise.resolve(this.client)
    }

    async shutdown(): Promise<void> {
        return this.client.quit().then(_ => { return })
    }
}

export const createFromConfig = (config: SystemConfig.Config): RedisFactory => {
    return new RedisFactory(<RedisOptions>{
        host: config.redis.host
    })
}

export const createForTest = (): RedisFactory => {
    return new RedisFactory(<RedisOptions>{
        host: "redis"
    })
}