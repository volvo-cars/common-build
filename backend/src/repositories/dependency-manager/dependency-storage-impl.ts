import { RedisFactory } from "../../redis/redis-factory";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import _ from "lodash"
import { RedisUtils } from "../../redis/redis-utils";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { DependencyStorage } from "./dependency-storage";
import { createLogger, loggerName } from "../../logging/logging-factory";

const logger = createLogger(loggerName(__filename))

export class DependencyStoragImpl implements DependencyStorage {
    constructor(private readonly redisFactory: RedisFactory) { }

    lookup(...refs: DependencyRef.Ref[]): Promise<RepositorySource[]> {
        if (refs.length) {
            return this.redisFactory.get().then(async client => {
                let multi = client.multi()
                refs.forEach(ref => {
                    multi.smembers(this.refKey(ref.serialize()))
                })
                const allSerializedSources = _.uniq(<string[]>(await RedisUtils.executeMulti(multi)).flat())
                return allSerializedSources.map(string => {
                    return RepositorySource.deserialize(string)
                })
            })
        } else {
            return Promise.resolve([])
        }
    }
    update(source: RepositorySource, ...refs: DependencyRef.Ref[]): Promise<void> {
        logger.debug(`Add dependency listeners for ${source}: [${refs.join(",")}]`)
        return this.redisFactory.get().then(async client => {
            const sourceKey = this.sourceKey(source)
            const newSerialized = refs.map(ref => { return ref.serialize() })
            const existingSerialized = (await client.smembers(sourceKey)) || []
            const toAdd = _.difference(newSerialized, existingSerialized)
            const toRemove = _.difference(existingSerialized, newSerialized)
            let multi = client.multi()
            multi.del(sourceKey)
            if (newSerialized.length) {
                multi.sadd(sourceKey, ...newSerialized)
            }
            const serializedSource = source.serialize()
            toAdd.forEach(serializedRef => {
                multi.sadd(this.refKey(serializedRef), serializedSource)
            })
            toRemove.forEach(serializedRef => {
                multi.srem(this.refKey(serializedRef), serializedSource)
            })
            return RedisUtils.executeMulti(multi).then(_ => { return })
        })
    }

    private sourceKey(source: RepositorySource): string {
        return `dependencies-source:${source.id}:${source.path}`
    }

    private refKey(serializedRef: string): string {
        return `dependencies-refs:${serializedRef}`
    }

}