import { Refs } from "../../src/domain-model/refs";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { Version } from "../../src/domain-model/version";
import { PublisherManager } from "../../src/repositories/publisher/publisher-manager";
import { DependencyRef } from "../../src/domain-model/system-config/dependency-ref";

export class MockPublisherManager implements PublisherManager {
    constructor() { }
    addMetaData(source: RepositorySource, sha: Refs.ShaRef, refs: DependencyRef.Ref[]): Promise<void> {
        return Promise.resolve()
    }
    publications(source: RepositorySource, sha: Refs.ShaRef): Promise<DependencyRef.Ref[]> {
        return Promise.resolve([])
    }
    publish(refs: DependencyRef.Ref[], sha: Refs.ShaRef, version: Version): Promise<boolean[]> {
        return Promise.resolve([])
    }

} 