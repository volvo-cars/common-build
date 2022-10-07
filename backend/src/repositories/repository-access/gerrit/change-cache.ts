import { Refs } from "../../../domain-model/refs";
import { RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { RedisFactory } from "../../../redis/redis-factory";
import { ChangeInfo, GerritRepositoryAccess } from "./gerrit-repository-access";

export type ChangeInfoWithRelated = ChangeInfo & { relatedChanges: number }

export class ChangeCache {
    constructor(private redisFactory: RedisFactory, private repositoryAccess: GerritRepositoryAccess) { }

    getRelatedChanges(origin: RepositorySource, id: string, sha: Refs.ShaRef): Promise<number> {
        return this.repositoryAccess.internalGetRelatedChanges(id, sha.sha).then(relatedChanges => {
            return relatedChanges.changes.length
        })
    }
}