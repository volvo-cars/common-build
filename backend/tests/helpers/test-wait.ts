import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { GitFunction, LocalGitFactory, LocalGitLoadMode } from "../../src/git/local-git-factory"

export namespace TestWait {

    export const waitPromise = (milliseconds: number): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                resolve()
            }, milliseconds)
        })
    }

}