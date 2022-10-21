import { Refs } from "../domain-model/refs"
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { Version } from "../domain-model/version"
import { LocalGitCommands } from "../git/local-git-commands"
import { VersionType } from "../repositories/repository/repository"
import { JobExecutor } from './job-executor/job-executor'
import { Queue } from './queue/queue'
import { SourceCache } from "./source-cache"

export namespace BuildSystem {

    export interface Service {
        getStatus(key: JobExecutor.Key): Promise<Queue.State | undefined>
        release(source: RepositorySource, branch: Refs.Branch, versionType: VersionType): Promise<Version>
    }

    export interface UpdateReceiver {
        onUpdate(update: Update, message: string, error?: "error"): Promise<void>
        onPush(source: RepositorySource, entity: Refs.Entity): Promise<void>
        onDelete(source: RepositorySource, ref: Refs.EntityRef): Promise<void>
        onPrune(source: RepositorySource): Promise<void>
    }
}

export type UpdateId = string

export type UpdateLabel = string

export type BranchName = string

export abstract class Update {
    constructor(
        public readonly source: RepositorySource,
        public readonly id: UpdateId,
        public readonly sha: Refs.ShaRef,
        public readonly target: BranchName,
        public readonly title: string,
        public readonly labels: UpdateLabel[],
        public readonly url: string
    ) { }
    abstract get refSpec(): SourceCache.RefSpec
    toString(): string {
        return `Change ${this.id} (${this.source}) -> ${this.target} (${this.labels.join(", ")})`
    }
}


