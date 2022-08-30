import { Refs } from "../../domain-model/refs"
import { RepositoryPath } from "../../domain-model/repository-model/repository-source"
import { LocalGitCommands } from "../../git/local-git-commands"
import { Update, UpdateId } from "../../system/build-system"

export interface RepositoryAccess {
    getFile(repository: RepositoryPath, path: string, ref: Refs.Ref): Promise<string | null>
    updateBranch(repository: RepositoryPath, ref: Refs.BranchRef, contents: LocalGitCommands.Content[]): Promise<void>
    setValidBuild(repository: RepositoryPath, updateId: UpdateId, ref: Refs.ShaRef): Promise<void>
    rebase(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.ShaRef | null>
    merge(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.Branch>
    getBranchesAndTags(repository: RepositoryPath): Promise<(Refs.Branch | Refs.Tag)[]>
    getBranches(repository: RepositoryPath): Promise<Refs.Branch[]>
    getBranch(repository: RepositoryPath, name: string): Promise<Refs.Branch | undefined>
    getTags(repository: RepositoryPath): Promise<Refs.Tag[]>
    getTag(repository: RepositoryPath, name: string): Promise<Refs.Tag | undefined>
    createTag(repository: RepositoryPath, sha: Refs.ShaRef, name: string, message?: string): Promise<Refs.Tag>
    createBranch(repository: RepositoryPath, fromSha: Refs.ShaRef, name: string): Promise<Refs.Branch>
    getUpdates(repository: RepositoryPath): Promise<Update[]>
    createUpdate(repository: RepositoryPath, target: Refs.Ref, labels: string[], ...content: Content[]): Promise<UpdateId>
    updateUpdate(repository: RepositoryPath, updateId: UpdateId, ...content: Content[]): Promise<void>
}

export type Content = {
    content: string,
    path: string
}

