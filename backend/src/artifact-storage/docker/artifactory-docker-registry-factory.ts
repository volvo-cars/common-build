import { SystemConfig } from '../../config/system-config'
import { DependencyRef } from '../../domain-model/system-config/dependency-ref'
import { ServiceConfig } from '../../domain-model/system-config/service-config'
import { createLogger, loggerName } from '../../logging/logging-factory'
import { VaultService } from '../../vault/vault-service'
import { ArtifactoryDockerRegistryImpl, DockerRegistry } from "./artifactory-docker-registry"

export interface ArtifactoryDockerRegistryFactory {
    get(id: DependencyRef.ImageRemote): DockerRegistry | undefined
}

const logger = createLogger(loggerName(__filename))

export class ArtifactoryDockerRegistryFactoryImpl implements ArtifactoryDockerRegistryFactory {
    private cache: Map<DependencyRef.ImageRemote, DockerRegistry>
    constructor(private configs: ServiceConfig.DockerRegistry[], private vaultService: VaultService) {
        this.cache = new Map<DependencyRef.ImageRemote, DockerRegistry>()
    }

    get(remote: DependencyRef.ImageRemote): DockerRegistry | undefined {
        let existing = this.cache.get(remote)
        if (existing) {
            return existing
        }
        const registryConfig = this.configs.find(config => {
            return config.host === remote
        })
        if (registryConfig) {
            if (registryConfig instanceof ServiceConfig.ArtifactoryDockerRegistry) {
                let registry = new ArtifactoryDockerRegistryImpl(registryConfig, this.vaultService)
                this.cache.set(remote, registry)
                return registry
            } else {
                throw new Error(`Unknown implementation for DockerRegistry config: ${registryConfig.constructor.name}`)
            }
        } else {
            logger.warn(`Could not find registry: ${remote} in ${this.configs}`)
            return undefined
        }

    }
}
