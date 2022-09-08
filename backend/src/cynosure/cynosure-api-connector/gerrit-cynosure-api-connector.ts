import { AxiosError, AxiosResponse } from "axios";
import _ from 'lodash';
import { SystemConfig } from "../../config/system-config";
import { Refs } from "../../domain-model/refs";
import { RepositoryPath } from "../../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../../domain-model/system-config/service-config";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { RedisFactory } from "../../redis/redis-factory";
import { Http, HttpMethod } from "../../utils/http";
import { retryWithTimeout } from "../../utils/retry-with-timeout";

import { CynosureApiConnector, CynosureProtocol } from "./cynosure-api-connector";
const logger = createLogger(loggerName(__filename))

export class GerritCynosureApiConnector implements CynosureApiConnector {
    private static cacheTTL = Math.floor(1 * 24 * 60 * 60 / 1000)
    constructor(private redisFactory: RedisFactory, private source: ServiceConfig.GerritSourceService) { }


    findProductId(path: RepositoryPath): Promise<string | undefined> {
        return this.redisFactory.get().then(async client => {
            const cacheKey = `cynosure-product-id:${this.source.id}/${path}`
            const existing = await client.get(cacheKey)
            if (existing) {
                logger.debug(`Cynosure product-id cached: ${this.source.id}/${path} -> ${existing}`)
                return Promise.resolve(existing)
            } else {
                if (this.source.ssh) {
                    let host = this.source.cynosure || this.source.ssh
                    if (host.indexOf(":") === -1) {
                        host = `${host}:22`
                    }
                    return Http.createRequest("https://core.productdb.cynosure.volvocars.biz/api/2.0.0/product/query", HttpMethod.POST).setData({
                        "query": {
                            "access.uri": `ssh://${host}/${path}`
                        }
                    }).setHeaders({
                        "Content-Type": "application/json"
                    }
                    ).execute().then((response: AxiosResponse<CynosureProtocol.FindProductResponse>) => {
                        if (response.data.length > 0) {
                            const productId = response.data[0].namespace
                            client.set(cacheKey, productId, "EX", GerritCynosureApiConnector.cacheTTL)
                            return Promise.resolve(productId)
                        } else {
                            return Promise.resolve(undefined)
                        }
                    }).catch((error: AxiosError) => {
                        return Promise.reject(new Error(`Could not fetch product-id for ${this.source.id}/${path}: ${error}`))
                    })

                    // This is the preferred endpoint BUT it doesn't work with csp-gerrit-qa projects.
                    /*return Http.createRequest("https://core.productdb.cynosure.volvocars.biz/api/2.0.0/product/namespace", HttpMethod.POST)
                        .setData(`ssh://${host}/${path}`)
                        .setHeaders({
                            "Content-Type": "text/plain"
                        }
                        ).execute().then((response: AxiosResponse<string>) => {
                            if (response.data.length > 0) {
                                const productId = response.data
                                client.set(cacheKey, productId, "EX", GerritCynosureApiConnector.cacheTTL)
                                return Promise.resolve(productId)
                            } else {
                                return Promise.resolve(undefined)
                            }
                        }).catch((error: AxiosError) => {
                            return Promise.reject(`Could not fetch product-id for ${this.source.id}/${path}: ${error}`)
                        })
                        */
                } else {
                    return Promise.reject(new Error(`The GerritSource ${this.source.id} doesn't have a stream configuration. No produt id can be done.`))
                }
            }
        })
    }

    findActivity(productId: CynosureProtocol.ProductId, sha: Refs.ShaRef): Promise<CynosureProtocol.Activity | undefined> {

        return Http.createRequest("https://core.statedb.cynosure.volvocars.biz/api/3.0.0/activity/query", HttpMethod.POST).setData({
            "query": {
                "productId.namespace": productId,
                "productId.instance": sha.sha
            }
        }).setHeaders({
            "Content-Type": "application/json"
        }
        ).execute().then((response: AxiosResponse<CynosureProtocol.FindActivityResponse>) => {
            return Promise.resolve(_.first(response.data))
        })
    }

    startActivity(productId: CynosureProtocol.ProductId, sha: Refs.ShaRef): Promise<boolean> {
        return Http.createRequest("https://core.messagebus.cynosure.volvocars.biz/api/3.0.0/ProductUpdated", HttpMethod.POST).setData({
            "productId": {
                "namespace": productId,
                "instance": sha.sha
            },
            "sender": {
                "service": "common-build"
            },
            "_updateOps": {
                "push": {
                    "tags": "ready_to_build"
                }
            }
        }).setHeaders({
            "Content-Type": "application/json"
        }).execute()
            .then(response => {
                return Promise.resolve(true)
            })
            .catch((e: AxiosError) => {
                if (e.response?.status === 404) {
                    return Promise.resolve(false) // Signals for valid retry
                } else {
                    return Promise.reject(new Error(`Could not start activity for product ${productId}. Error ${e.code} ${e.response?.status}`))
                }
            })
    }

    abortActivity(activityId: string, sha: Refs.ShaRef, reason: string): Promise<void> {
        logger.debug(`Sending abort signal to Cynosure for ${activityId}/${sha}`)
        return Http.createRequest(`https://admin.chain.cynosure.volvocars.biz/api/1.0.0/job/${activityId}/abort`, HttpMethod.POST).setData({
            comment: `Aborted by CommonBuild: ${reason}`
        }).execute().then(result => {
            return Promise.resolve()
        }).catch((error: AxiosResponse) => {
            logger.debug(`Abort signal to Cynosure responded ${JSON.stringify(error, null, 2)}`)
            return Promise.resolve()

        })
    }

}






