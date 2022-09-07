import { Refs } from "../../domain-model/refs"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { JobRef } from "./job-ref"

export interface JobExecutorListener {
    onJobStarted(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    onJobFailure(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    onJobSuccess(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    onJobAborted(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    onJobError(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
}

export interface JobExecutor {
    startJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    abortJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void
    setListener(listener: JobExecutorListener): void
}