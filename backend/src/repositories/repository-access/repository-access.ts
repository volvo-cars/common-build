import { Readable } from "stream"
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
    getLabels(id: UpdateId): Promise<string[] | undefined>
    createUpdate(repository: RepositoryPath, target: Refs.BranchRef, labels: string[], ...content: Content.Content[]): Promise<UpdateId>
    updateUpdate(repository: RepositoryPath, updateId: UpdateId, ...content: Content.Content[]): Promise<boolean>
}

export namespace Content {
    export interface Content {
        path: string
        content(): Buffer
    }

    export class Binary implements Content {

        constructor(public readonly path: string, private data: Buffer) { }

        static fromStream(path: string, stream: Readable): Promise<Binary> {
            return new Promise<Binary>((resolve, reject) => {
                const buf = Array<any>()
                stream.on("data", chunk => buf.push(chunk))
                stream.on("end", () => {
                    const buffer = Buffer.concat(buf)
                    const binary = new Binary(path, buffer)
                    resolve(binary)
                })
                stream.on("error", err => {
                    reject(new Error(`error converting stream - ${err}`))
                })
                stream.resume()
            })
        }

        content(): Buffer {
            return this.data
        }
    }
    export class Text implements Content {
        constructor(public readonly path: string, private data: string) { }
        content(): Buffer {
            return Buffer.from(this.data, "utf-8")
        }
    }
}