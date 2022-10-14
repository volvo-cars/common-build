import Redis from "ioredis"
import _ from "lodash"
import { ArtifactoryFactory } from "../../artifact-storage/artifactory/artifactory-factory"
import { ArtifactoryDockerRegistryFactory } from "../../artifact-storage/docker/artifactory-docker-registry-factory"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { RedisUtils } from "../../redis/redis-utils"
import { Duration } from "../../task-queue/time"
import { PublicationRepositoryMetaDataKeys } from "../publisher/publisher-manager"
import { RepositoryFactory } from "../repository/repository-factory"
import { DependencyLookup } from "./dependency-lookup"
import { VersionContainer } from "./version-container"

const logger = createLogger(loggerName(__filename))

const Const = {
    CacheTTL_SUCCESS: Duration.fromMinutes(15),
    CacheTTL_FAILURE: Duration.fromMinutes(3),
    INVALID_KEY: "CACHE_INVALID",
    SerializedKey: "serialized",
    RepositoryKey: "repository"
}


export class DependencyLookupCacheImpl implements DependencyLookup.Cache {

    constructor(private repositoryModelFactory: RepositoryFactory, private artifactoryFactory: ArtifactoryFactory, private dockerRegistryFactory: ArtifactoryDockerRegistryFactory, private redis: RedisFactory) { }

    private generateCacheKey(ref: DependencyRef.Ref): string {
        return `dependency-lookup-cache:${ref.serialize()}`
    }

    invalidate(...refs: DependencyRef.Ref[]): Promise<void> {
        logger.debug(`Invaliding artifacts: ${refs.join(",")}`)
        return this.redis.get().then(client => {
            const keys = refs.map(r => { return this.generateCacheKey(r) })
            return client.del(...keys).then()
        })
    }

    getAllVersions(ref: DependencyRef.Ref): Promise<DependencyLookup.CacheEntry | undefined> {
        const cacheKey = this.generateCacheKey(ref)
        return this.redis.get().then(client => {
            return client.hmget(cacheKey, Const.SerializedKey, Const.RepositoryKey).then(([serializedContainer, serializedRepo]) => {
                if (serializedContainer) {
                    if (serializedContainer === Const.INVALID_KEY) {
                        return undefined
                    }
                    const container = VersionContainer.deserialize(serializedContainer)
                    const maybeRepository = serializedRepo ? RepositorySource.deserialize(serializedRepo) : undefined
                    return new DependencyLookup.CacheEntry(container, maybeRepository)
                }
                const createContainer = (): Promise<[VersionContainer, RepositorySource | undefined]> => {
                    if (ref instanceof DependencyRef.GitRef) {
                        return this.repositoryModelFactory.get(ref.source).modelReader().then(modelReader => {
                            const container = VersionContainer.fromVersions(modelReader.allVersions())
                            return [container, ref.source]
                        })
                    } else if (ref instanceof DependencyRef.ArtifactRef) {
                        const artifactory = this.artifactoryFactory.get(ref.remote)
                        return artifactory.getArtifacts(ref.repository, ref.path).then(artifacts => {
                            let repositoryIdStr: string | undefined = undefined
                            // This is not good. Should be changed to follow the rules of the picked artifact.
                            const container = VersionContainer.fromVersions(artifacts.flatMap(a => {
                                repositoryIdStr = repositoryIdStr || a.properties[PublicationRepositoryMetaDataKeys.id]
                                const v = Version.parse(a.version)
                                return v ? [v] : []
                            }))
                            const maybeRepository = repositoryIdStr ? RepositorySource.createFromString(repositoryIdStr) : undefined
                            return [container, maybeRepository]
                        })
                    } else if (ref instanceof DependencyRef.ImageRef) {
                        const dockerRegistry = this.dockerRegistryFactory.get(ref.remote)
                        if (dockerRegistry) {
                            return dockerRegistry.getTags(ref.repository).then(tags => {
                                const container = VersionContainer.fromVersions(tags.flatMap(tag => {
                                    const v = Version.parse(tag)
                                    if (v) {
                                        return [v]
                                    } else {
                                        return []
                                    }
                                }))
                                return [container, undefined]
                            })
                        } else {
                            return Promise.reject(new Error(`Could not find DockerRegistry config for ${ref.remote}`))
                        }
                    } else {
                        return Promise.reject(new Error(`Unsupport dependency-ref for lookup: ${ref.toString()}`))
                    }
                }
                return createContainer().then(([container, maybeRepository]) => {
                    const state = _.merge({}, { [Const.SerializedKey]: container.serialize() }, maybeRepository ? { [Const.RepositoryKey]: maybeRepository.serialize() } : {})
                    return RedisUtils.executeMulti(client.multi()
                        .hmset(cacheKey, state)
                        .expire(cacheKey, Const.CacheTTL_SUCCESS.seconds())
                    ).then(() => {
                        return new DependencyLookup.CacheEntry(container, maybeRepository)
                    })
                }).catch(e => {
                    logger.warn(`Dependency cache: ${e}`)
                    return RedisUtils.executeMulti(client.multi()
                        .hmset(cacheKey, { [Const.SerializedKey]: Const.INVALID_KEY })
                        .expire(cacheKey, Const.CacheTTL_FAILURE.seconds())
                    ).then(() => {
                        return undefined
                    })
                })
            })
        })
    }
}