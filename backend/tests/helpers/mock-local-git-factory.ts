import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { GitFunction, LocalGitFactory, LocalGitLoadMode } from "../../src/git/local-git-factory"

export class MockLocalGitFactory implements LocalGitFactory {
    invalidate(source: RepositorySource): Promise<void> {
        return Promise.resolve()
    }
    execute<T>(source: RepositorySource, f: GitFunction<T>, loadMode: LocalGitLoadMode): Promise<T> {
        return Promise.resolve({} as T)
    }

}