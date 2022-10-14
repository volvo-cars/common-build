import { Refs } from "../../domain-model/refs"
import { RepositorySource } from '../../domain-model/repository-model/repository-source'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RawModelRepository } from "./raw-model-repository"
import { RepositoryModelReader, RepositoryModelReaderImpl } from "./repository-model-reader"

export interface Repository {
    modelReader(): Promise<RepositoryModelReader>
}

export class MajorRead {
    constructor(public readonly major: number, public sha: Refs.ShaRef | undefined) { }
}
export class WriteBranch {
    constructor(public readonly sha: Refs.ShaRef, public readonly branch: Refs.BranchRef, public readonly exists: boolean) { }
}

export enum VersionType {
    MINOR = "minor",
    PATCH = "patch"
}

const logger = createLogger(loggerName(__filename))

export class RepositoryImpl implements Repository {
    constructor(private source: RepositorySource, private rawModelRepository: RawModelRepository) { }

    modelReader(): Promise<RepositoryModelReader> {
        return this.rawModelRepository.getModel(this.source).then(model => {
            return new RepositoryModelReaderImpl(model)
        })
    }

}




