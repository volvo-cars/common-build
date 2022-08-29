import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";

const logger = createLogger(loggerName(__filename))

const NOT_FOUND_VALUE = "!!__<CONTENT_NOT_FOUND>!!__"

export class DataCache {
    constructor(private redisFactory: RedisFactory, private dataTTL: number) { }

    get(key: string): Promise<string | null | undefined> {
        return this.redisFactory.get().then(client => {
            return client.get(key).then(result => {
                if (result === NOT_FOUND_VALUE) {
                    return null
                } else if (result) {
                    return result
                } else {
                }
            })
        })
    }
    set(key: string, data: string | null): Promise<void> {
        return this.redisFactory.get().then(client => {
            return client.set(key, data || NOT_FOUND_VALUE, "EX", this.dataTTL).then(() => { return })
        })
    }
}
