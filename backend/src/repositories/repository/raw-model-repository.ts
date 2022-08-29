import { Refs } from '../../domain-model/refs'
import { RepositoryModel } from '../../domain-model/repository-model/repository-model'
import { RepositoryPath, RepositorySource } from '../../domain-model/repository-model/repository-source'
import { Codec } from '../../domain-model/system-config/codec'
import { createLogger, loggerName } from '../../logging/logging-factory'
import { RedisFactory } from "../../redis/redis-factory"
import { NormalizedModel, NormalizedModelUtil } from "./normalized-model"
import { RawDataToModelConverter } from './raw-data-to-model-converter'

export interface RepositoryStateProvider {
    getState(path: RepositoryPath): Promise<(Refs.Branch | Refs.Tag)[]>
}

const logger = createLogger(loggerName(__filename))

export class RawModelRepository {

    constructor(private redis: RedisFactory) { }

    async clear(source: RepositorySource): Promise<void> {
        return this.redis.get().then(client => {
            return client.del(this.modelKey(source)).then(() => { })
        })
    }

    private getRawModelFromSource(source: RepositorySource, repositoryStateProvider: RepositoryStateProvider): Promise<RawModel.Data> {
        return repositoryStateProvider.getState(source.path).then(entities => {
            let main: RawModel.StringSha | undefined = undefined
            let releaseTags: RawModel.NumbersSha[] = []
            let patchBranches: RawModel.NumbersSha[] = []
            let majors: RawModel.NumberSha[] = []
            entities.forEach(entity => {
                const normalizedRef = NormalizedModelUtil.normalize(entity.ref)
                if (normalizedRef) {
                    if (normalizedRef.type === NormalizedModel.Type.RELEASE_TAG) {
                        releaseTags.push(
                            {
                                numbers: (<NormalizedModel.ReleaseTagRef>normalizedRef).segments,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef.type === NormalizedModel.Type.PATCH_BRANCH) {
                        patchBranches.push(
                            {
                                numbers: (<NormalizedModel.PatchBranchRef>normalizedRef).segments,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef.type === NormalizedModel.Type.MAJOR_TAG) {
                        majors.push(
                            {
                                number: (<NormalizedModel.MajorTagRef>normalizedRef).major,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef.type === NormalizedModel.Type.MAIN_BRANCH) {
                        main = {
                            name: (<NormalizedModel.MainBranchRef>normalizedRef).name,
                            sha: entity.sha.sha
                        }
                    }
                }
            })
            if (main) {
                return <RawModel.Data>{
                    main: main,
                    releaseTags: releaseTags,
                    patchBranches: patchBranches,
                    majorTags: majors
                }
            } else {
                throw new Error("Could not build repository model data. Missing main branch.")
            }
        })
    }

    getModel(source: RepositorySource, repositoryStateProvider: RepositoryStateProvider): Promise<RepositoryModel.Root> {
        return this.redis.get().then(async client => {
            const serializedModel = await client.get(this.modelKey(source))
            if (serializedModel) {
                return Promise.resolve(Codec.toInstance(serializedModel, RepositoryModel.Root))
            } else {
                return this.getRawModelFromSource(source, repositoryStateProvider).then(async rawModel => {
                    const loadedModel = RawDataToModelConverter.convertModel(rawModel)
                    await client.set(this.modelKey(source), Codec.toJson(loadedModel))
                    return Promise.resolve(loadedModel)
                })
            }
        })
    }


    private modelKey(source: RepositorySource): string { return `repository-model:${source.id}:${source.path}` }

}


export namespace RawModel {

    export type StringSha = { name: string, sha: string }
    export type NumberSha = { number: number, sha: string }
    export type NumbersSha = { numbers: number[], sha: string }

    export type Data = {
        readonly main: StringSha,
        readonly releaseTags: NumbersSha[],
        readonly patchBranches: NumbersSha[],
        readonly majorTags: NumberSha[]
    }
}

