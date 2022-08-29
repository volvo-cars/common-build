import { Refs } from "../../domain-model/refs"
import { RepositorySource } from '../../domain-model/repository-model/repository-source'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { createExecutionSerializer } from "../../system/execution-serializer"
import { RepositoryAccess } from "../repository-access/repository-access"
import { RawModelRepository, RepositoryStateProvider } from "./raw-model-repository"
import { RepositoryModelReader, RepositoryModelReaderImpl } from "./repository-model-reader"

export interface Repository {
    invalidate(): Promise<void>
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

export class RepositoryImpl implements Repository, RepositoryStateProvider {
    private executionSerializer = createExecutionSerializer()
    constructor(private repositoryAccess: RepositoryAccess, private source: RepositorySource, private rawModelRepository: RawModelRepository) { }

    async getState(): Promise<(Refs.Tag | Refs.Branch)[]> {
        return this.repositoryAccess.getBranchesAndTags(this.source.path)
    }

    async invalidate(): Promise<void> {
        logger.debug(`Invalidating repository-model for ${this.source.id}/${this.source.path}`)
        return this.rawModelRepository.clear(this.source)
    }

    modelReader(): Promise<RepositoryModelReader> {
        const cmd = () => {
            return this.rawModelRepository.getModel(this.source, this).then(model => {
                return new RepositoryModelReaderImpl(model)
            })
        }
        return this.executionSerializer.execute(`${this.source.id}:${this.source.path}:resolve`, cmd)
    }

}




