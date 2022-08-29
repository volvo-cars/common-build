import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";

export interface ActiveRepositories {
    addActiveRepositories(...sources: RepositorySource[]): Promise<void>
    removeActiveRepositories(...sources: RepositorySource[]): Promise<void>
    activeRepositories(): Promise<RepositorySource[]>
    isActive(source: RepositorySource): Promise<boolean>
}

const logger = createLogger(loggerName(__filename))

class ActiveRepositoriesImpl implements ActiveRepositories {

    constructor(private readonly redisFactory: RedisFactory) { }

    private static activeRepositoryKey = `active-directories`

    addActiveRepositories(...sources: RepositorySource[]): Promise<void> {
        if (sources.length) {
            return this.redisFactory.get().then(client => {
                const keys = sources.map(source => { return source.serialize() })
                logger.debug(`Adding active repositories: ${keys.join(",")}`)
                return client.sadd(ActiveRepositoriesImpl.activeRepositoryKey, ...keys).then(__ => { return })
            })
        } else {
            return Promise.resolve()
        }
    }
    removeActiveRepositories(...sources: RepositorySource[]): Promise<void> {
        if (sources.length) {
            return this.redisFactory.get().then(client => {
                const keys = sources.map(source => { return source.serialize() })
                logger.debug(`Removing active repositories: ${keys.join(",")}`)
                return client.srem(ActiveRepositoriesImpl.activeRepositoryKey, ...keys).then(__ => { return })
            })
        } else {
            return Promise.resolve()
        }
    }

    activeRepositories(): Promise<RepositorySource[]> {
        return this.redisFactory.get().then(client => {
            return client.smembers(ActiveRepositoriesImpl.activeRepositoryKey).then(strings => {
                return strings.map(s => { return RepositorySource.deserialize(s) })
            })
        })
    }

    isActive(source: RepositorySource): Promise<boolean> {
        return this.redisFactory.get().then(client => {
            return client.sismember(ActiveRepositoriesImpl.activeRepositoryKey, source.serialize()).then(count => { return count > 0 })
        })
    }
}

export const createActiveRepositories = (redisFactory: RedisFactory): ActiveRepositories => {
    return new ActiveRepositoriesImpl(redisFactory)
}