import _ from 'lodash'
import { RepositoryAccess } from "./repository-access";
import { GerritRepositoryAccess } from "./gerrit/gerrit-repository-access";
import { StringTypedMap } from "../../utils/model";
import { SystemConfig } from "../../config/system-config";
import { RedisFactory } from "../../redis/redis-factory";
import { DataCache } from "./data-cache";
import { LocalGitFactory } from "../../git/local-git-factory";
import { Refs } from "../../domain-model/refs";
import { RepositoryPath, RepositoryStoreId } from "../../domain-model/repository-model/repository-source";
import { ServiceConfig } from '../../domain-model/system-config/service-config';
import { VaultService } from '../../vault/vault-service';
import { GitlabRepositoryAccess } from './gitlab/gitlab-repository-access';


export interface RepositoryAccessFactory {
    createAccess(repository: RepositoryStoreId): RepositoryAccess
    getImplementation<T extends RepositoryAccess>(id: RepositoryStoreId): T
}

export class RepositoryAccessFactoryImpl implements RepositoryAccessFactory {
    private connectors: StringTypedMap<RepositoryAccess>
    constructor(sources: ServiceConfig.SourceService[], localGitFactory: LocalGitFactory, private vaultService: VaultService) {
        this.connectors = _.reduce(sources, (acc: any, source: ServiceConfig.SourceService) => {
            if (source instanceof ServiceConfig.GerritSourceService) {
                const repositoryAccess = new GerritRepositoryAccess(source, localGitFactory, this.vaultService)
                acc[source.id] = repositoryAccess
                return acc
            } else if (source instanceof ServiceConfig.GitlabSourceService) {
                const repositoryAccess = new GitlabRepositoryAccess(source, localGitFactory, this.vaultService)
                acc[source.id] = repositoryAccess
                return acc
            } else {
                throw new Error(`Unknown RepositoryAccess type: ${source.constructor.name}:${JSON.stringify(source)}`)
            }
        }, {})
    }

    createAccess(id: RepositoryStoreId): RepositoryAccess {
        let config = this.connectors[id]
        if (config) {
            return config
        } else {
            throw new Error(`Source config ${id} doesn't exist.`)
        }
    }

    getImplementation<T extends RepositoryAccess>(id: RepositoryStoreId): T {
        let connector = this.connectors[id]
        if (connector) {
            if (connector.constructor.name === GerritRepositoryAccess.name) {
                return <T>connector
            } else {
                throw new Error(`Mismatching RepositorySource ${id}. Not expected impl. ${connector.constructor.name}!=${GerritRepositoryAccess.name}`)
            }
        } else {
            throw new Error(`Source config ${id} doesn't exist.`)
        }

    }


}


