import { Refs } from "../domain-model/refs";
import { RepositorySource } from "../domain-model/repository-model/repository-source";

export namespace SourceCache {
    export interface Service {

        /**
         * Ensures the the provided ref exist in the cache.
         * @param source 
         * @param ref 
         * @param refSpec 
         * @throws EnsureFailedError
         */
        ensureRef(source: RepositorySource, ref: Refs.Ref, refSpec: RefSpec): Promise<void>


        ensureEntity(source: RepositorySource, entity: Refs.Entity, refSpec: RefSpec): Promise<void>
        ensureDeleted(source: RepositorySource, ref: Refs.EntityRef, refSpec: RefSpec): Promise<void>

        getEntities(source: RepositorySource): Promise<Refs.Entity[]>
        registerListener(listener: Listener): void
        getCommits(source: RepositorySource, to: Refs.Ref, from: Refs.Ref | undefined, maxCount: number): Promise<GitCommit[]>
        fetchAllDefaults(source: RepositorySource): Promise<void>

    }

    export class EnsureFailedError extends Error {
        constructor(message: string) {
            super(message)
        }
    }

    export interface Listener {
        onUpdate(source: RepositorySource): Promise<void>
    }

    export class RefSpec {
        constructor(readonly pattern: string) { }
    }

    export class GitCommit {
        constructor(public readonly sha: string, public readonly commiter: string, public readonly timestamp: number, public readonly message: string) { }
    }
}