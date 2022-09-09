import { Refs } from "../../../domain-model/refs";
import { RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { RedisFactory } from "../../../redis/redis-factory";
import { ChangeInfo, GerritRepositoryAccess } from "./gerrit-repository-access";

export class ChangeCache {
    private static CACHE_TTL = 1 * 1000
    constructor(private redisFactory: RedisFactory, private repositoryAccess: GerritRepositoryAccess) { }

    getChangeByChangeNumber(origin: RepositorySource, changeNumber: number, sha: Refs.ShaRef): Promise<ChangeInfo> {
        return this.redisFactory.get().then(async client => {
            const key = `change-cache:${origin.id}/${origin.path}:${changeNumber}/${sha.sha}`
            const existing = await client.get(key)
            if (!existing) {
                try {
                    const update = (await this.repositoryAccess.internalGetChangeByChangeNr(changeNumber))
                    await client.set(key, JSON.stringify(update), "EX", ChangeCache.CACHE_TTL)
                    return update
                } catch (e) {
                    return Promise.reject(e)
                }
            } else {
                return Promise.resolve(JSON.parse(existing))
            }
        })
    }
}