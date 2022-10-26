import { instanceToPlain, plainToInstance } from 'class-transformer'
import YAML from 'yaml'
import { Refs } from '../domain-model/refs'
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { BuildConfig } from '../domain-model/system-config/build-config'
import { Codec } from '../domain-model/system-config/codec'
import { DependenciesConfig } from '../domain-model/system-config/dependencies-config'
import { PublicationConfig } from '../domain-model/system-config/publication-config'
import { RepositoryConfig } from '../domain-model/system-config/repository-config'
import { LocalGitCommands } from '../git/local-git-commands'
import { createLogger, loggerName } from '../logging/logging-factory'
import { StructuredYaml } from '../utils/structured-yaml'
import { RepositoryAccessFactory } from './repository-access/repository-access-factory'
import { SystemFilesAccess } from './system-files-access'



const logger = createLogger(loggerName(__filename))

export class SystemFilesAccessImpl implements SystemFilesAccess {
    constructor(private repositoryAcccessFactory: RepositoryAccessFactory) { }


    getFile(source: RepositorySource, path: string, ref: Refs.Ref): Promise<string | undefined> {
        return this.repositoryAcccessFactory.createAccess(source.id).getFile(source.path, path, ref).then(result => { return result || undefined })
    }

    getRepositoryConfig(source: RepositorySource): Promise<RepositoryConfig.Config | undefined> {
        return this.repositoryAcccessFactory.createAccess(source.id).getFile(source.path, "config.yml", Refs.MetaConfigBranchRef.INSTANCE).then(content => {
            if (content) {
                try {
                    let repositoryConfigYml = StructuredYaml.parse(content)
                    return Codec.toInstance(repositoryConfigYml, RepositoryConfig.Config)
                } catch (e) {
                    logger.warn(`Parse error on config.yml: ${e} ${source} Ref:${Refs.MetaConfigBranchRef.INSTANCE.name}`)
                    return Promise.resolve(undefined)
                }
            } else {
                return Promise.resolve(undefined)
            }
        })
    }
    saveRepositoryConfig(source: RepositorySource, config: RepositoryConfig.Config): Promise<void> {
        if (config) {
            const access = this.repositoryAcccessFactory.createAccess(source.id)
            const content = [
                new LocalGitCommands.Content("config.yml", StructuredYaml.stringify(Codec.toPlain(config)))
            ]
            return access.updateBranch(source.path, Refs.MetaConfigBranchRef.INSTANCE, content)
        } else {
            return Promise.reject(new Error("Invalid config"))
        }
    }

    getBuildConfig(source: RepositorySource, ref: Refs.Ref, parseException?: true): Promise<BuildConfig.Config | undefined> {
        return this.repositoryAcccessFactory.createAccess(source.id).getFile(source.path, BuildConfig.FILE_PATH, ref).then(content => {

            if (content) {
                try {
                    let gateYml = Codec.toInstance(StructuredYaml.parse(content), BuildConfig.Config)
                    return Promise.resolve(gateYml)
                } catch (e) {
                    logger.warn(`Parse error on ${BuildConfig.FILE_PATH} in ${source}/${ref.name}: ${e}`)
                    if (parseException) {
                        throw e
                    }
                    return Promise.resolve(undefined)
                }
            } else {
                return Promise.resolve(undefined)
            }
        })
    }
    getPublicationConfig(source: RepositorySource, ref: Refs.Ref): Promise<PublicationConfig.Config | undefined> {
        return this.repositoryAcccessFactory.createAccess(source.id).getFile(source.path, PublicationConfig.FILE_PATH, ref).then(content => {
            if (content) {
                try {
                    let gateYml = Codec.toInstance(StructuredYaml.parse(content), PublicationConfig.Config)
                    return Promise.resolve(gateYml)
                } catch (e) {
                    logger.warn(`Parse error on ${PublicationConfig.FILE_PATH} in ${source}/${ref.name}: ${e}`)
                    return Promise.resolve(undefined)
                }
            } else {
                return Promise.resolve(undefined)
            }
        })
    }
    getDependenciesConfig(source: RepositorySource, ref: Refs.Ref): Promise<DependenciesConfig.Config | undefined> {
        return this.repositoryAcccessFactory.createAccess(source.id).getFile(source.path, DependenciesConfig.FILE_PATH, ref).then(content => {
            if (content) {
                try {
                    let dependenciesYml = StructuredYaml.parse(content)
                    return Promise.resolve(Codec.toInstance(dependenciesYml, DependenciesConfig.Config))
                } catch (e) {
                    logger.warn(`Parse error on ${DependenciesConfig.FILE_PATH} in ${source}/${ref.name}: ${e}`)
                    return Promise.resolve(undefined)
                }
            } else {
                return Promise.resolve(undefined)
            }
        })
    }
    serialize(config: object): string {
        const plain = Codec.toPlain(config)
        return StructuredYaml.stringify(plain)
    }

}