import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { RedisFactory } from "../../redis/redis-factory";
import { SourceCache } from "../../system/source-cache";
import { RawModelRepository } from "./raw-model-repository";
import { Repository, RepositoryImpl } from "./repository";

export interface RepositoryFactory {
    get(source: RepositorySource): Repository
}

export class RepositoryFactoryImpl implements RepositoryFactory {

    private readonly rawModelRepository: RawModelRepository

    constructor(redis: RedisFactory, sourceCache: SourceCache.Service) {
        this.rawModelRepository = new RawModelRepository(redis, sourceCache)
    }

    get(source: RepositorySource): Repository {
        return new RepositoryImpl(source, this.rawModelRepository)
    }

}

