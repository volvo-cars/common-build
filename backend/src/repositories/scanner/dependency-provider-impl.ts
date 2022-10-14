import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { SystemFilesAccess } from "../system-files-access"
import { DependencyLookup } from "./dependency-lookup"

const logger = createLogger(loggerName(__filename))

export class DependencyProviderImpl implements DependencyLookup.Provider {

    constructor(private cache: DependencyLookup.Cache, private selector: DependencyLookup.DependencySelector, private systemAccess: SystemFilesAccess) { }

    getVersion(ref: DependencyRef.Ref, current: Version): Promise<Version | undefined> {
        return this.cache.getAllVersions(ref).then(entry => {
            if (entry) {
                const getDependencySerie = (): Promise<string | undefined> => {
                    if (entry.origin) {
                        return this.systemAccess.getRepositoryConfig(entry.origin).then(config => {
                            return config?.majorSerie?.id
                        })
                    } else {
                        return Promise.resolve(undefined)
                    }
                }
                return getDependencySerie().then(maybeSerie => {
                    return this.selector.pick(entry.container, current, maybeSerie)
                })
            } else {
                logger.warn(`Could not find any versions of reference: ${ref.toString()}`)
                return undefined
            }
        }).then(maybeVersion => {
            return maybeVersion
        })
    }




}