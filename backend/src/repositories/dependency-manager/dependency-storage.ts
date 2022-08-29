import { RedisFactory } from "../../redis/redis-factory";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import _ from "lodash"
import { RedisUtils } from "../../redis/redis-utils";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";

export interface DependencyStorage {
    findDependentSources(...refs: DependencyRef.Ref[]): Promise<RepositorySource[]>
    setDependencies(source: RepositorySource, ...refs: DependencyRef.Ref[]): Promise<void>
    isKnown(...sources: RepositorySource[]): Promise<boolean[]>
}

export class DependencyStoragImpl implements DependencyStorage {
    constructor(private readonly redisFactory: RedisFactory) { }

    findDependentSources(...refs: DependencyRef.Ref[]): Promise<RepositorySource[]> {
        if (refs.length) {
            return this.redisFactory.get().then(async client => {
                let multi = client.multi()
                refs.forEach(ref => {
                    multi = multi
                        .smembers(this.refKey(ref.serialize()))
                })
                const allSerializedSources = _.uniq(<string[]>_.flatten((await RedisUtils.executeMulti(multi))))
                return allSerializedSources.map(string => {
                    return RepositorySource.deserialize(string)
                })
            })
        } else {
            return Promise.resolve([])
        }
    }
    setDependencies(source: RepositorySource, ...refs: DependencyRef.Ref[]): Promise<void> {
        return this.redisFactory.get().then(async client => {
            const newSerialized = refs.map(ref => { return ref.serialize() })
            const existingSerialized = (await client.smembers(this.sourceKey(source))) || []
            const toAdd = _.difference(newSerialized, existingSerialized)
            const toRemove = _.difference(existingSerialized, newSerialized)
            const sourceKey = this.sourceKey(source)
            let multi = client.multi()
            const serializedSource = source.serialize()
            if (toAdd.length) {
                multi = multi
                    .sadd(sourceKey, ...toAdd)
                toAdd.forEach(serializedRef => {
                    multi = multi.sadd(this.refKey(serializedRef), serializedSource)
                })

            }
            if (toRemove.length) {
                multi = multi
                    .srem(sourceKey, ...toAdd)
                toAdd.forEach(serializedRef => {
                    multi = multi.srem(this.refKey(serializedRef), serializedSource)
                })
            }
            multi = multi.sadd(this.sourceKnownKey(), serializedSource)
            return RedisUtils.executeMulti(multi).then(_ => { return })
        })
    }

    isKnown(...sources: RepositorySource[]): Promise<boolean[]> {
        return this.redisFactory.get().then(client => {
            return client.smismember(this.sourceKnownKey(), ...(sources.map(s => { return s.serialize() }))).then(results => {
                return results.map(r => { return r > 0 })
            })
        })
    }


    private sourceKey(source: RepositorySource): string {
        return `dependencies-source:${source.id}:${source.path}`
    }
    private sourceKnownKey(): string {
        return `dependencies-source-known`
    }
    private refKey(serializedRef: string): string {
        return `dependencies-refs:${serializedRef}`
    }

}