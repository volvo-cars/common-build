import { Refs } from "../domain-model/refs"
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { Version } from "../domain-model/version"
import { VersionType } from "../repositories/repository/repository"
import { JobExecutor } from './job-executor/job-executor'
import { Queue } from './queue/queue'

export namespace BuildSystem {

    export interface Service {
        getStatus(key: JobExecutor.Key): Promise<Queue.State | undefined>
        release(source: RepositorySource, branch: Refs.Branch, versionType: VersionType): Promise<Version>
    }

    export interface UpdateReceiver {
        onUpdate(update: Update, message: string, error?: "error"): Promise<void>
        onPush(source: RepositorySource, ref: Refs.Ref, newSha: Refs.ShaRef): Promise<void>
        onDelete(source: RepositorySource, ref: Refs.Ref): Promise<void>
    }
}

export type UpdateId = string

export type UpdateLabel = string

export type BranchName = string

export class Update {
    constructor(
        public readonly source: RepositorySource,
        public readonly id: UpdateId,
        public readonly sha: Refs.ShaRef,
        public readonly target: BranchName,
        public readonly title: string,
        public readonly labels: UpdateLabel[],
        public readonly changeNumber: number,
        public readonly url: string
    ) { }

    toString(): string {
        return `Change ${this.id}/${this.changeNumber} (${this.source}) -> ${this.target} (${this.labels.join(", ")})`
    }
}


