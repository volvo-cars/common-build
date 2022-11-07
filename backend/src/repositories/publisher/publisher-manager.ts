import { Expose, Type } from "class-transformer";
import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { Version } from "../../domain-model/version";

export interface PublisherManager {
    publications(source: RepositorySource, ref: Refs.Ref): Promise<DependencyRef.Ref[]>
    publish(refs: DependencyRef.Ref[], sha: Refs.ShaRef, version: Version): Promise<boolean[]>
    addMetaData(source: RepositorySource, sha: Refs.ShaRef): Promise<void>
}

export const PublicationRepositoryMetaDataKeys = {
    "id": "repository.id"
}


