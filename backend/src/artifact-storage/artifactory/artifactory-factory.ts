import _ from 'lodash'
import { Artifactory, ArtifactoryImpl } from "./artifactory"
import { SystemConfig } from '../../config/system-config'
import { DependencyRef } from '../../domain-model/system-config/dependency-ref'
import { ServiceConfig } from '../../domain-model/system-config/service-config'
import { VaultService } from '../../vault/vault-service'

export interface ArtifactoryFactory {
    get(remote: DependencyRef.ArtifactRemote): Artifactory
}

export class ArtifactoryFactoryImpl implements ArtifactoryFactory {
    private cache: Map<DependencyRef.ArtifactRemote, Artifactory>
    constructor(private vaultService: VaultService) {
        this.cache = new Map<DependencyRef.ArtifactRemote, Artifactory>()
    }

    get(remote: DependencyRef.ArtifactRemote): Artifactory {
        let existing = this.cache.get(remote)
        if (existing) {
            return existing
        }
        let artifactory = new ArtifactoryImpl(remote, this.vaultService)
        this.cache.set(remote, artifactory)
        return artifactory
    }
}
