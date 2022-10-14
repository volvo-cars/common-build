import { RepositoryModel } from '../../domain-model/repository-model/repository-model'
import { RepositorySource } from '../../domain-model/repository-model/repository-source'
import { Codec } from '../../domain-model/system-config/codec'
import { createLogger, loggerName } from '../../logging/logging-factory'
import { RedisFactory } from "../../redis/redis-factory"
import { SourceCache } from '../../system/source-cache'
import { NormalizedModel, NormalizedModelUtil } from "./normalized-model"
import { RawDataToModelConverter } from './raw-data-to-model-converter'
import { RawModel } from './raw-model'



const logger = createLogger(loggerName(__filename))

export class RawModelRepository implements SourceCache.Listener {

    constructor(private redis: RedisFactory, private sourceCache: SourceCache.Service) {
        sourceCache.registerListener(this)
    }

    onUpdate(source: RepositorySource): Promise<void> {
        return this.redis.get().then(client => {
            logger.debug(`Cleared RawModelRepository cache for ${source}`)
            return client.del(this.modelKey(source)).then(() => { })
        })
    }

    private getRawModelFromSource(source: RepositorySource): Promise<RawModel.Data> {
        return this.sourceCache.getEntities(source).then(entities => {
            let main: RawModel.StringSha | undefined = undefined
            let releaseTags: RawModel.NumbersSha[] = []
            let patchBranches: RawModel.NumbersSha[] = []
            let majors: RawModel.NumberSha[] = []
            entities.forEach(entity => {
                const normalizedRef = NormalizedModelUtil.normalize(entity.ref)
                if (normalizedRef) {
                    if (normalizedRef instanceof NormalizedModel.ReleaseTagRef) {
                        releaseTags.push(
                            {
                                numbers: normalizedRef.segments,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef instanceof NormalizedModel.PatchBranchRef) {
                        patchBranches.push(
                            {
                                numbers: normalizedRef.segments,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef instanceof NormalizedModel.MajorTagRef) {
                        majors.push(
                            {
                                number: normalizedRef.major,
                                sha: entity.sha.sha
                            }
                        )
                    } else if (normalizedRef instanceof NormalizedModel.MainBranchRef) {
                        main = {
                            name: normalizedRef.name,
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

    getModel(source: RepositorySource): Promise<RepositoryModel.Root> {
        return this.redis.get().then(client => {
            return client.get(this.modelKey(source)).then(serializedModel => {
                if (serializedModel) {
                    return Promise.resolve(Codec.toInstance(serializedModel, RepositoryModel.Root))
                } else {
                    return this.getRawModelFromSource(source).then(async rawModel => {
                        const loadedModel = RawDataToModelConverter.convertModel(rawModel)
                        await client.set(this.modelKey(source), Codec.toJson(loadedModel))
                        return Promise.resolve(loadedModel)
                    })
                }
            })
        })
    }

    private modelKey(source: RepositorySource): string { return `repository-model:${source.id}:${source.path}` }

}