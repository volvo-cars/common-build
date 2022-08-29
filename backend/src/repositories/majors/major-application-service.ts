import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { Majors } from "../../domain-model/system-config/majors";
import { RepositoryAccessFactory } from "../repository-access/repository-access-factory";
import { RepositoryFactory } from "../repository/repository-factory";
import { SystemFilesAccess, SystemFilesAccessImpl } from "../system-files-access";
export interface MajorApplicationService {
    applyMajors(value: Majors.Value, sources: RepositorySource[]): Promise<MajorApplicationResult.Result[]>
    applyMajor(value: Majors.Value, source: RepositorySource): Promise<MajorApplicationResult.Action>
}

export namespace MajorApplicationResult {
    export enum Action {
        EXISTS = "exists",
        CREATED = "created",
        MANUAL = "manual",
        NOT_SUBSCRIBED = "not_subscribed",
        MISSING_CONFIG = "missing_config",
        ERROR = "error"
    }

    export class Result {
        constructor(public readonly action: Action, public readonly source: RepositorySource) { }
    }
}

export class MajorApplicationServiceImpl implements MajorApplicationService {
    private serviceFilesAccess: SystemFilesAccess
    constructor(private repositoryFactory: RepositoryFactory, private repositoryAccessFactory: RepositoryAccessFactory) {
        this.serviceFilesAccess = new SystemFilesAccessImpl(repositoryAccessFactory)
    }

    applyMajor(value: Majors.Value, source: RepositorySource): Promise<MajorApplicationResult.Action> {
        return this.processSource(source, value, true)
    }

    applyMajors(value: Majors.Value, sources: RepositorySource[]): Promise<MajorApplicationResult.Result[]> {
        return Promise.all(sources.map(async source => {
            const action = await this.processSource(source, value, false)
            return new MajorApplicationResult.Result(action, source)
        }))
    }

    private processSource(source: RepositorySource, value: Majors.Value, forceApply: boolean): Promise<MajorApplicationResult.Action> {
        return this.serviceFilesAccess.getRepositoryConfig(source).then(async config => {
            if (config) {
                if (config.majorSerie) {
                    const majorSerie = config.majorSerie
                    if (majorSerie.id === value.id) {
                        if (majorSerie.autoApply || forceApply) {
                            const modelReader = await this.repositoryFactory.get(source).modelReader()
                            if (value.value > modelReader.model.main.major) {
                                return this.repositoryAccessFactory.createAccess(source.id).createTag(source.path, Refs.ShaRef.create(modelReader.model.main.main.sha), `major-${value.value}`).then(createdTag => {
                                    return MajorApplicationResult.Action.CREATED
                                }).catch(e => {
                                    return MajorApplicationResult.Action.EXISTS
                                })
                            } else {
                                return MajorApplicationResult.Action.EXISTS
                            }
                        } else {
                            return MajorApplicationResult.Action.MANUAL
                        }
                        throw "NI"
                    } else {
                        return MajorApplicationResult.Action.NOT_SUBSCRIBED
                    }
                } else {
                    return MajorApplicationResult.Action.NOT_SUBSCRIBED
                }
            } else {
                return MajorApplicationResult.Action.MISSING_CONFIG
            }
        }).catch(e => {
            return MajorApplicationResult.Action.ERROR
        })
    }

}