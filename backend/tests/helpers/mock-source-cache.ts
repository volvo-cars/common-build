import { Refs } from "../../src/domain-model/refs";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { SourceCache } from "../../src/system/source-cache";

export class MockSourceCache implements SourceCache.Service {

    private listeners: SourceCache.Listener[] = []
    private entities: Map<RepositorySource, Refs.Entity[]> = new Map()
    constructor() { }
    prune(source: RepositorySource): Promise<void> {
        throw new Error("Method not implemented.");
    }

    fetchAllDefaults(source: RepositorySource): Promise<void> {
        throw new Error("Method not implemented.");
    }

    ensureRef(source: RepositorySource, ref: Refs.Ref, refSpec: SourceCache.RefSpec): Promise<void> {
        throw new Error("Method not implemented.");
    }
    ensureEntity(source: RepositorySource, entity: Refs.Entity, refSpec: SourceCache.RefSpec): Promise<void> {
        throw new Error("Method not implemented.");
    }
    ensureDeleted(source: RepositorySource, ref: Refs.EntityRef): Promise<void> {
        throw new Error("Method not implemented.");
    }

    setNewEntities(source: RepositorySource, ...newEntities: Refs.Entity[][]): Promise<void> {
        this.entities.set(source, newEntities.flat())
        return Promise.all(this.listeners.map(l => { return l.onUpdate(source) })).then()
    }

    getEntities(source: RepositorySource): Promise<Refs.Entity[]> {
        return Promise.resolve(this.entities.get(source) || [])
    }
    registerListener(listener: SourceCache.Listener): void {
        this.listeners.push(listener)
    }
    getCommits(source: RepositorySource, to: Refs.Ref, from: Refs.Ref | undefined, maxCount: number): Promise<SourceCache.GitCommit[]> {
        throw new Error("Method not implemented.");
    }

}