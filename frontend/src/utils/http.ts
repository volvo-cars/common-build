import axios, { AxiosBasicCredentials, AxiosError, AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from "axios"
import { createLogger } from "../logging/logging-factory"
import { chopString } from "./string-util"


export enum HttpMethod {
    GET = "get",
    POST = "post",
    PUT = "put",
    DELETE = "delete"
}

const logger = createLogger("http")

export class Http {
    private constructor() { }

    static createRequest(url: string, method: HttpMethod = HttpMethod.GET): HttpBuilder {
        return new HttpBuilderImpl(url, method)
    }
}

class HttpBuilderImpl implements HttpBuilder {
    private config: AxiosRequestConfig<any> = {}
    constructor(private url: string, private method: HttpMethod) {

    }
    setData(data: any): HttpBuilder {
        this.config.data = data
        return this
    }
    setHeaders(headers: AxiosRequestHeaders): HttpBuilder {
        this.config.headers = headers
        return this
    }
    setAuth(auth: AxiosBasicCredentials): HttpBuilder {
        this.config.auth = auth
        return this
    }
    execute(): Promise<AxiosResponse<any, any>> {
        const logStatement = `${this.method.toUpperCase()} ${this.url} ${this.config.data ? JSON.stringify(this.config.data) : ""}`
        this.config.method = this.method
        this.config.url = this.url
        const request = axios.request(this.config)
        logger.info(`Executing ${logStatement}`)
        return request.then((response: AxiosResponse) => {
            console.log("RESPONSE", response)
            const responseData = response.data ? chopString(JSON.stringify(response.data), 100) : "<empty>"
            logger.debug(`API: ${response.status} ${logStatement} -> ${responseData}`)
            return Promise.resolve(response)
        }).catch((e: AxiosError) => {
            const responseData = "->" + e.response?.data ? chopString(JSON.stringify(e.response?.data), 100) : "<empty>"
            logger.info(`API: ${e.response?.status} ${logStatement} -> ${responseData}`)
            return Promise.reject(e)
        })

    }

}

export interface HttpBuilder {
    setData(data: any): HttpBuilder
    setHeaders(headers: AxiosRequestHeaders): HttpBuilder
    setAuth(auth: AxiosBasicCredentials): HttpBuilder
    execute(): Promise<AxiosResponse<any, any>>
}