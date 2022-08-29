import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { RedisFactory } from "../../redis/redis-factory";
import { RepositoryAccessFactory } from "../repository-access/repository-access-factory";
import { RawModelRepository } from "./raw-model-repository";
import { Repository, RepositoryImpl } from "./repository";

export interface RepositoryFactory {
    get(source: RepositorySource): Repository
}

export class RepositoryFactoryImpl implements RepositoryFactory {
    private readonly rawModelRepository: RawModelRepository
    constructor(private redis: RedisFactory, private repositoryAccessFactory: RepositoryAccessFactory) {
        this.rawModelRepository = new RawModelRepository(redis)
    }
    get(source: RepositorySource): Repository {
        return new RepositoryImpl(this.repositoryAccessFactory.createAccess(source.id), source, this.rawModelRepository)
    }
}

