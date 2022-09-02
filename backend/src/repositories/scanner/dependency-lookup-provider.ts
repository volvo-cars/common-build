import { ArtifactoryFactory } from "../../artifact-storage/artifactory/artifactory-factory"
import { ArtifactoryDockerRegistryFactory } from "../../artifact-storage/docker/artifactory-docker-registry-factory"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { RepositoryFactory } from "../repository/repository-factory"
import { RepositoryModelReader } from "../repository/repository-model-reader"
import { VersionContainer } from "./version-container"

const logger = createLogger(loggerName(__filename))

export interface DependencyLookupProvider {
    getVersion(ref: DependencyRef.Ref, major: number | undefined): Promise<Version | undefined>
}

export interface DependencyLookupProviderFactory {
    createProvider(): DependencyLookupProvider
}

export class DependencyLookupProviderFactoryImpl implements DependencyLookupProviderFactory {
    constructor(private repositoryModelFactory: RepositoryFactory, private artifactoryFactory: ArtifactoryFactory, private registryFactory: ArtifactoryDockerRegistryFactory, private redis: RedisFactory) { }
    createProvider(): DependencyLookupProvider {
        return new DependencyLookupProviderImpl(this.repositoryModelFactory, this.artifactoryFactory, this.registryFactory, this.redis)
    }
}

export class DependencyLookupProviderImpl implements DependencyLookupProvider {

    private gitVersionCache: Map<string, RepositoryModelReader> = new Map()
    private versionContainerCache: Map<string, VersionContainer> = new Map()

    constructor(private repositoryModelFactory: RepositoryFactory, private artifactoryFactory: ArtifactoryFactory, private dockerRegistryFactory: ArtifactoryDockerRegistryFactory, private redis: RedisFactory) { }

    async getVersion(ref: DependencyRef.Ref, major: number | undefined): Promise<Version | undefined> {
        const key = ref.serialize()
        if (ref instanceof DependencyRef.GitRef) {
            const cachedModel = this.gitVersionCache.get(key)
            if (cachedModel) {
                return cachedModel.highestVersion(major)
            } else {
                const model = await this.repositoryModelFactory.get(ref.source).modelReader()
                this.gitVersionCache.set(key, model)
                return model.highestVersion(major)
            }
        } else {
            const cachedContainer = this.versionContainerCache.get(key)
            if (cachedContainer) {
                return cachedContainer.getHighest(major)
            }
            if (ref instanceof DependencyRef.ArtifactRef) {
                const artifactory = this.artifactoryFactory.get(ref.remote)
                const artifacts = await artifactory.getArtifacts(ref.repository, ref.path)
                const model = new VersionContainer(artifacts.flatMap(a => {
                    const v = Version.parse(a.version)
                    if (v) {
                        return [v]
                    } else {
                        return []
                    }
                }))
                this.versionContainerCache.set(key, model)
                return model.getHighest(major)
            } else if (ref instanceof DependencyRef.ImageRef) {
                const dockerRegistry = this.dockerRegistryFactory.get(ref.remote)
                if (dockerRegistry) {
                    const tags = await dockerRegistry.getTags(ref.repository)
                    const model = new VersionContainer(tags.flatMap(tag => {
                        const v = Version.parse(tag)
                        if (v) {
                            return [v]
                        } else {
                            return []
                        }
                    }))
                    this.versionContainerCache.set(key, model)
                    return model.getHighest(major)
                } else {
                    logger.warn(`Could not find DockerRegistry config for ${ref.remote}`)
                }
            } else {
                throw new Error(`Resolve dependency not implemented for ${ref.serialize()}`)
            }
        }
    }

    clearDependencyCache(ref: DependencyRef.Ref): Promise<void> {
        const key = ref.serialize()
        this.gitVersionCache.delete(key)
        this.versionContainerCache.delete(key)
        return Promise.resolve()
    }
}