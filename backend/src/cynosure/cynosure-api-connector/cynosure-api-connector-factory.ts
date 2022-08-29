import _ from "lodash";
import { SystemConfig } from "../../config/system-config";
import { RepositoryStoreId } from "../../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../../domain-model/system-config/service-config";
import { RedisFactory } from "../../redis/redis-factory";
import { StringTypedMap } from "../../utils/model";
import { CynosureApiConnector } from "./cynosure-api-connector";
import { GerritCynosureApiConnector } from "./gerrit-cynosure-api-connector";


export interface CynosureApiConnectorFactory {
    createApiConnector(id: RepositoryStoreId): CynosureApiConnector | undefined
}

class CynosureApiConnectorFactoryImpl implements CynosureApiConnectorFactory {
    private connectors: StringTypedMap<CynosureApiConnector>
    constructor(private redisFactory: RedisFactory, sources: ServiceConfig.SourceService[]) {
        this.connectors = _.reduce(sources, (acc: any, source: ServiceConfig.SourceService) => {
            if (source instanceof ServiceConfig.GerritSourceService) {
                acc[source.id] = new GerritCynosureApiConnector(this.redisFactory, source)
            }
            return acc
        }, {})
    }

    createApiConnector(id: RepositoryStoreId): CynosureApiConnector | undefined {
        return this.connectors[id]
    }
}

export const createCynosureConnectorFactory = (redisFactory: RedisFactory, sources: ServiceConfig.SourceService[]): CynosureApiConnectorFactory => {
    return new CynosureApiConnectorFactoryImpl(redisFactory, sources)
}
