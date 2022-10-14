import assert from "assert";
import { Refs } from "../domain-model/refs";
import { RepositorySource } from "../domain-model/repository-model/repository-source";
import { LocalGitCommands } from "../git/local-git-commands";
import { LocalGitFactory, LocalGitLoadMode } from "../git/local-git-factory";
import { SourceCache } from "./source-cache";

export class SourceCacheImpl implements SourceCache.Service {

    constructor(private localGitFactory: LocalGitFactory) { }

    fetchAllDefaults(source: RepositorySource): Promise<void> {
        return this.localGitFactory.execute(source, LocalGitCommands.FetchDefaultRemotes.INSTANCE, LocalGitLoadMode.CACHED).then(() => {
            return this.fireListeners(source)
        })
    }

    ensureRef(source: RepositorySource, ref: Refs.Ref, refSpec: SourceCache.RefSpec): Promise<void> {
        return this.localGitFactory.execute(source, new LocalGitCommands.MacroEnsureRefExists(ref, new LocalGitCommands.RefSpec(refSpec.pattern)), LocalGitLoadMode.CACHED).then(result => {
            return this.handleEnsureResult(source, result, ref, refSpec)
        })
    }
    ensureEntity(source: RepositorySource, entity: Refs.Entity, refSpec: SourceCache.RefSpec): Promise<void> {
        return this.localGitFactory.execute(source, new LocalGitCommands.MacroEnsureEntityExists(entity, new LocalGitCommands.RefSpec(refSpec.pattern)), LocalGitLoadMode.CACHED).then(result => {
            return this.handleEnsureResult(source, result, entity, refSpec)
        })
    }
    ensureDeleted(source: RepositorySource, ref: Refs.EntityRef, refSpec: SourceCache.RefSpec): Promise<void> {
        return this.localGitFactory.execute(source, new LocalGitCommands.MacroEnsureRefDeleted(ref, new LocalGitCommands.RefSpec(refSpec.pattern)), LocalGitLoadMode.CACHED).then(result => {
            return this.handleEnsureResult(source, result, ref, refSpec)
        })
    }

    private handleEnsureResult(source: RepositorySource, result: LocalGitCommands.EnsureResult, entity: any, refSpec: SourceCache.RefSpec): Promise<void> {
        if (result === LocalGitCommands.EnsureResult.NO_ACTION) {
            return Promise.resolve()
        } else if (result === LocalGitCommands.EnsureResult.UPDATED) {
            return this.fireListeners(source)
        } else if (result === LocalGitCommands.EnsureResult.NOT_FOUND) {
            return Promise.reject(new SourceCache.EnsureFailedError(`Could not load ${entity} from ${refSpec}.`))
        } else {
            return Promise.reject(new SourceCache.EnsureFailedError(`Unknown EnsureResult ${result}`))
        }
    }

    private listeners: SourceCache.Listener[] = []

    getEntities(source: RepositorySource): Promise<Refs.Entity[]> {
        return this.localGitFactory.execute(source, LocalGitCommands.getBranchesAndTags(), LocalGitLoadMode.CACHED)
    }

    getCommits(source: RepositorySource, to: Refs.ShaRef, from: Refs.TagRef | undefined, maxCount: number): Promise<SourceCache.GitCommit[]> {
        const MAX_COMMIT_COUNT = 100
        return this.localGitFactory.execute(source, LocalGitCommands.getCommits(to, from, MAX_COMMIT_COUNT), LocalGitLoadMode.CACHED).then(commits => {
            return commits.map(c => {
                return new SourceCache.GitCommit(c.sha, c.commiter, c.timestamp, c.message)
            })
        })
    }

    registerListener(listener: SourceCache.Listener): void {
        this.listeners.push(listener)
    }

    private fireListeners(source: RepositorySource): Promise<void> {
        return Promise.all(this.listeners.map(l => {
            return l.onUpdate(source)
        })).then()
    }
}