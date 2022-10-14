import { RedisFactory } from "../../redis/redis-factory";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import _ from "lodash"
import { RedisUtils } from "../../redis/redis-utils";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";

export interface DependencyStorage {
    lookup(...refs: DependencyRef.Ref[]): Promise<RepositorySource[]>
    update(source: RepositorySource, ...dependencies: DependencyRef.Ref[]): Promise<void>
    isKnown(...sources: RepositorySource[]): Promise<boolean[]>
}

