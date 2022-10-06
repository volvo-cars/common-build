import { Refs } from "../../../domain-model/refs";
import { RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { RedisFactory } from "../../../redis/redis-factory";
import { ChangeInfo, GerritRepositoryAccess } from "./gerrit-repository-access";

export type ChangeInfoWithRelated = ChangeInfo & { relatedChanges: number }

export class ChangeCache {
    private static CACHE_TTL = 1 * 1000
    constructor(private redisFactory: RedisFactory, private repositoryAccess: GerritRepositoryAccess) { }

    getChangeByChangeNumber(origin: RepositorySource, changeNumber: number, sha: Refs.ShaRef): Promise<ChangeInfoWithRelated> {
        return this.redisFactory.get().then(async client => {
            const key = `change-cache:${origin.asString()}:${changeNumber}/${sha.sha}`
            const existing = await client.get(key)
            if (!existing) {
                try {
                    const update = await this.repositoryAccess.internalGetChangeByChangeNr(changeNumber)
                    const related = await this.repositoryAccess.internalGetRelatedChanges(update.change_id, sha.sha)
                    const updatedWithRelated: ChangeInfoWithRelated = Object.assign({}, update, { relatedChanges: related.changes.length })
                    await client.set(key, JSON.stringify(updatedWithRelated), "EX", ChangeCache.CACHE_TTL)
                    return updatedWithRelated
                } catch (e) {
                    return Promise.reject(e)
                }
            } else {
                return Promise.resolve(JSON.parse(existing))
            }
        })
    }
}