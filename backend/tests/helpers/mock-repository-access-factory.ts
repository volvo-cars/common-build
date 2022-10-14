import { SystemConfig } from "../../src/config/system-config"
import { createLogger, loggerName } from "../../src/logging/logging-factory"
import { Content, RepositoryAccess } from "../../src/repositories/repository-access/repository-access"
import { RepositoryAccessFactory } from "../../src/repositories/repository-access/repository-access-factory"
import { Update, UpdateId } from "../../src/system/build-system"
import { StringTypedMap } from "../../src/utils/model"
import { Refs } from "../../src/domain-model/refs"
import { LocalGitCommands } from "../../src/git/local-git-commands"
import { RepositoryPath, RepositoryStoreId } from "../../src/domain-model/repository-model/repository-source"

const logger = createLogger(loggerName(__filename))

export class MockRepositoryAccessFactory implements RepositoryAccessFactory, RepositoryAccess {
    constructor(private readonly files: StringTypedMap<string>) { }
    getLabels(id: string): Promise<string[] | undefined> {
        throw new Error("Method not implemented.")
    }
    setValidBuild(repository: string, updateId: string, ref: Refs.ShaRef): Promise<void> {
        return Promise.resolve()
    }
    getImplementation<T extends RepositoryAccess>(id: string): T {
        throw new Error("Method not implemented.")
    }
    updateBranch(repository: string, ref: Refs.BranchRef, contents: LocalGitCommands.Content[]): Promise<void> {
        throw new Error("Method not implemented.")
    }
    getBranchesAndTags(repository: string): Promise<(Refs.Branch | Refs.Tag)[]> {
        throw new Error("Method not implemented.")
    }
    getBranches(repository: string): Promise<Refs.Branch[]> {
        throw new Error("Method not implemented.")
    }
    getBranch(repository: string, name: string): Promise<Refs.Branch | undefined> {
        throw new Error("Method not implemented.")
    }
    getTags(repository: string): Promise<Refs.Tag[]> {
        throw new Error("Method not implemented.")
    }
    getTag(repository: string, name: string): Promise<Refs.Tag | undefined> {
        throw new Error("Method not implemented.")
    }


    createTag(repository: string, sha: Refs.ShaRef, name: string, message?: string): Promise<Refs.Tag> {
        throw new Error("Method not implemented.")
    }
    createBranch(repository: string, fromSha: Refs.ShaRef, name: string): Promise<Refs.Branch> {
        throw new Error("Method not implemented.")
    }
    getUpdates(repository: string): Promise<Update[]> {
        throw new Error("Method not implemented.")
    }
    createUpdate(repository: string, target: Refs.Ref, labels: string[], ...content: Content.Content[]): Promise<UpdateId> {
        throw new Error("Method not implemented.")
    }
    updateUpdate(repository: string, updateId: string, ...content: Content.Content[]): Promise<boolean> {
        throw new Error("Method not implemented.")
    }

    getFile(repository: RepositoryPath, path: string, revision: Refs.Ref): Promise<string | null> {
        const content = this.files[path] || null
        logger.debug(`Mock content: ${path} -> ${content?.length || 0} characters`)
        return Promise.resolve(content)
    }


    createAccess(repository: RepositoryStoreId): RepositoryAccess {
        return this
    }
    async merge(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.Branch> {
        return Promise.reject(new Error("Not implemented"))
    }

    async rebase(repository: RepositoryPath, update: UpdateId): Promise<Refs.ShaRef | null> {
        return Promise.resolve(null)
    }
}