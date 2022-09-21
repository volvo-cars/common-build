import { RepositorySource } from "../domain-model/repository-model/repository-source";
import { SystemFilesAccess } from "../repositories/system-files-access";
import { ActiveSystem } from "./active-system";
import { ActiveSystemUtil } from "./active-system-util";

const DEFAULT_SYSTEM = "staging"

export class ActiveSystemImpl implements ActiveSystem.System {
    constructor(public readonly systemId: string, private readonly systemFilesAccess: SystemFilesAccess) { }

    isActive(source: RepositorySource): Promise<boolean> {
        return this.systemFilesAccess.getRepositoryConfig(source).then(repositoryConfig => {
            return ActiveSystemUtil.isRepositoryOnCurrentSystem(repositoryConfig?.activeSystem, DEFAULT_SYSTEM, this.systemId)
        })
    }
    availableSystems(): Promise<string[]> {
        return Promise.resolve([this.systemId])
    }

}