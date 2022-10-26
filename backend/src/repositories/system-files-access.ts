import { Refs } from '../domain-model/refs'
import { RepositorySource } from '../domain-model/repository-model/repository-source'
import { BuildConfig } from '../domain-model/system-config/build-config'
import { DependenciesConfig } from '../domain-model/system-config/dependencies-config'
import { PublicationConfig } from '../domain-model/system-config/publication-config'
import { RepositoryConfig } from '../domain-model/system-config/repository-config'

export interface SystemFilesAccess {
    getRepositoryConfig(source: RepositorySource): Promise<RepositoryConfig.Config | undefined>
    saveRepositoryConfig(source: RepositorySource, config: RepositoryConfig.Config): Promise<void>
    getBuildConfig(source: RepositorySource, ref: Refs.Ref, parseException?: true): Promise<BuildConfig.Config | undefined>
    getPublicationConfig(source: RepositorySource, ref: Refs.Ref): Promise<PublicationConfig.Config | undefined>
    getDependenciesConfig(source: RepositorySource, ref: Refs.Ref): Promise<DependenciesConfig.Config | undefined>
    getFile(source: RepositorySource, path: string, ref: Refs.Ref): Promise<string | undefined>
    serialize(config: object): string

}
