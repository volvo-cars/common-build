import _ from 'lodash'
import axios from 'axios'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { SystemConfig } from "../../config/system-config"
import { StringTypedMap } from '../../utils/model'
import { Http, HttpMethod } from '../../utils/http'
import { HttpError } from 'koa'
import { DependencyRef } from '../../domain-model/system-config/dependency-ref'
import { ServiceConfig } from '../../domain-model/system-config/service-config'
import { VaultService } from '../../vault/vault-service'
import { Readable } from 'stream'

const logger = createLogger(loggerName(__filename))

export interface ArtifactoryArtifact {
    version: string,
    properties: Record<string, string>
}

export interface Artifactory {
    getArtifacts(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath): Promise<ArtifactoryArtifact[]>
    getArtifact(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, name: string): Promise<ArtifactoryArtifact | undefined>
    copy(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, source: string, destination: string): Promise<void>
    addArtifactProperties(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, name: string, properties: Record<string, string>): Promise<void>
}

export class ArtifactoryImpl implements Artifactory {
    constructor(private host: string, private vaultService: VaultService) { }


    private createHeaders(): Promise<Record<string, string>> {
        return this.vaultService.getSecret(`csp/common-build/artifactory-${this.host}`).then(secret => {
            return {
                "X-JFrog-Art-Api": secret,
                "Content-Type": "text/plain"
            }
        })
    }



    private createQuery(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, name: string | undefined): string {
        return `items.find({
            "repo":{"$eq": "${repository}"},
            "path":{"$eq": "${path}"},
            ${name ? `"name":{"$eq": "${name}"},` : ""}
            "type":{"$eq": "folder"}
           }).include("*", "property.*")`
    }

    addArtifactProperties(repository: string, path: string, name: string, properties: Record<string, string>): Promise<void> {
        const keys = Object.keys(properties)
        if (keys.length) {
            return this.createHeaders().then(headers => {
                const propertiesArray = keys.reduce((acc: string[], nextKey) => {
                    acc.push(`${nextKey}=${properties[nextKey]}`)
                    return acc
                }, [])
                const url = `https://${this.host}/artifactory/api/storage/${repository}/${path}/${name}?properties=${propertiesArray.join(";")}&recursive=1`
                return Http.createRequest(url, HttpMethod.PUT)
                    .setHeaders(headers)
                    .execute()
                    .then((response) => {
                        if (response.status >= 200 && response.status < 300) {
                            return Promise.resolve()
                        } else {
                            return Promise.reject(new Error(`Could not set properties to ${url}. Response: ${response.status}`))
                        }
                    })
            })
        } else {
            return Promise.resolve()
        }
    }

    addArtifactContent(repository: string, path: string, name: string, fileName: string, content: Readable): Promise<void> {
        return this.createHeaders().then(headers => {
            const finalHeaders = _.merge({}, headers, { "Content-Type": "application/octet-stream" })
            const url = `https://${this.host}/artifactory/${repository}/${path}/${name}/${fileName}`
            logger.debug(`Adding Artifact content: ${url}`)
            return axios
                .put(url, content, {
                    headers: finalHeaders,
                    responseType: "stream",
                    maxContentLength: Number.MAX_SAFE_INTEGER,
                    maxBodyLength: Number.MAX_SAFE_INTEGER,
                })
                .then((response) => {
                    if (response.status >= 200 && response.status < 300) {
                        return Promise.resolve()
                    } else {
                        return Promise.reject(new Error(`Could not publish to ${url}. Response: ${response.status}`))
                    }
                })
        })
    }

    copy(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, source: string, destination: string): Promise<void> {
        if (path.split("/").length > 1 && source && destination) {
            const from = `${repository}/${path}/${source}`
            const to = `${repository}/${path}/${destination}`
            return this.createHeaders().then(headers => {
                return Http.createRequest(`https://${this.host}/artifactory/api/copy/${from}?to=/${to}`, HttpMethod.POST)
                    .setHeaders(headers)
                    .execute()
                    .then(_ => { return })
            })
        } else {
            logger.warn(`Could not copy: path:${path} source:${source} ${destination}`)
            return Promise.resolve()
        }
    }

    getArtifact(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath, name: string): Promise<ArtifactoryArtifact | undefined> {
        logger.debug(`Getting artifact ${this.host}/${repository}/${path}`)
        return this.createHeaders().then(headers => {
            return Http
                .createRequest(`https://${this.host}/artifactory/api/search/aql`, HttpMethod.POST)
                .setData(this.createQuery(repository, path, name))
                .setHeaders(headers
                ).execute()
                .then((response) => {
                    let data: ArtifactoryQueryResponse = response.data
                    let firstArtifact = _.first(data.results)
                    if (firstArtifact) {
                        return convertInternalArtifact(firstArtifact)
                    } else {
                        return undefined
                    }
                })
        })
    }

    getArtifacts(repository: DependencyRef.ArtifactRepository, path: DependencyRef.ArtifactPath): Promise<ArtifactoryArtifact[]> {
        logger.debug("Getting artifacts for " + `${this.host} ${repository}}/${path}`)
        return this.createHeaders().then(headers => {
            return Http
                .createRequest(`https://${this.host}/artifactory/api/search/aql`, HttpMethod.POST)
                .setData(this.createQuery(repository, path, undefined))
                .setHeaders(headers
                ).execute()
                .then((response) => {
                    let data: ArtifactoryQueryResponse = response.data
                    return _.map(data.results, (artifact: InternalArtifactoryArtifact) => {
                        const result = convertInternalArtifact(artifact)
                        return result
                    })
                })
        })
    }
}

type ArtifactoryQueryResponse = {
    results: InternalArtifactoryArtifact[]
}

type InternalArtifactoryArtifact = {
    repo: string,
    path: string,
    name: string,
    properties?: InternalArtifactoryArtifactProperty[]
}

type InternalArtifactoryArtifactProperty = {
    key: string,
    value: any
}

const convertInternalArtifact = (artifact: InternalArtifactoryArtifact): ArtifactoryArtifact => {
    return {
        version: artifact.name,
        properties: _.reduce(artifact.properties || [], (memo: any, property: InternalArtifactoryArtifactProperty) => {
            memo[property.key] = property.value
            return memo
        }, {})
    }
}

export const Test_convertArticat = convertInternalArtifact
export type Test_ArtifactoryArtifact = InternalArtifactoryArtifact