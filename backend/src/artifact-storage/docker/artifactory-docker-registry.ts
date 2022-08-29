import { StatusCodes } from 'http-status-codes'
import _, { head } from 'lodash'
import { SystemConfig } from "../../config/system-config"
import { DependencyRef } from '../../domain-model/system-config/dependency-ref'
import { ServiceConfig } from '../../domain-model/system-config/service-config'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { Http, HttpMethod } from '../../utils/http'
import { VaultService } from '../../vault/vault-service'

const logger = createLogger(loggerName(__filename))

export interface DockerRegistry {
    copy(repository: DependencyRef.ImageRepository, source: string, destination: string): Promise<void>
    getTags(repository: DependencyRef.ImageRepository): Promise<string[]>
}

export class ArtifactoryDockerRegistryImpl implements DockerRegistry {
    constructor(private config: ServiceConfig.ArtifactoryDockerRegistry, private vaultService: VaultService) { }


    private createHeaders(): Promise<any> {
        return this.vaultService.getSecret(`csp/common-build/artifactory-${this.config.artifactoryHost}`).then(secret => {
            return {
                "X-JFrog-Art-Api": secret
            }
        })
    }

    getTags(repository: string): Promise<string[]> {
        return this.createHeaders().then(headers => {
            return Http.createRequest(`https://${this.config.artifactoryHost}/artifactory/api/docker/${this.config.registryRepository}/v2/${repository}/tags/list`, HttpMethod.GET)
                .setHeaders(headers)
                .execute()
                .then(response => {
                    if (response.status === StatusCodes.OK) {
                        return response.data["tags"] || []
                    } else {
                        return Promise.reject(new Error(`Could not find docker tags for ${repository} in ${this.config.registryRepository}. Status:${response.status} ${response.statusText}`))
                    }
                })
        })
    }

    copy(repository: DependencyRef.ImageRepository, source: string, destination: string): Promise<void> {
        // Get manifest tagged <sha>. Upload same manifast under tag <destination>
        return this.createHeaders().then(headers => {
            return Http.createRequest(`https://${this.config.artifactoryHost}/artifactory/api/docker/${this.config.registryRepository}/v2/${repository}/manifests/${source}`, HttpMethod.GET)
                .setHeaders(_.merge({}, headers, { accept: "application/vnd.docker.distribution.manifest.v2+json" }))
                .execute()
                .then(response => {
                    if (response.status === StatusCodes.OK) {
                        const manifest = response.data
                        const putHeaders = _.merge({}, headers, { "content-type": "application/vnd.docker.distribution.manifest.v2+json" })
                        Http.createRequest(`https://${this.config.artifactoryHost}/artifactory/api/docker/${this.config.registryRepository}/v2/${repository}/manifests/${destination}`, HttpMethod.PUT)
                            .setHeaders(putHeaders)
                            .setData(manifest)
                            .execute().then(putResponse => {
                                if (putResponse.status === StatusCodes.CREATED) {
                                    return Promise.resolve()
                                } else {
                                    return Promise.reject(new Error(`Could not upload docker-manifest for ${destination}@${repository} in ${this.config.registryRepository}. Status:${response.status} ${response.statusText}`))
                                }
                            })

                    } else {
                        return Promise.reject(new Error(`Could not find docker-manifest for ${source}@${repository} in ${this.config.registryRepository}. Status:${response.status} ${response.statusText}`))
                    }
                })
        })

    }
}

