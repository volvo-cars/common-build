import { BuildLogEvents } from "../domain-model/buildlog-events/buildlog-events";
import { RepositorySource } from "../domain-model/repository-model/repository-source";

export namespace BuildLog {

    export interface Service {
        addMetaUrl(name: string, url: string, source: RepositorySource, logId: string): Promise<void>
        add(message: string, level: BuildLogEvents.Level, source: RepositorySource, logId: string): Promise<void>
        get(source: RepositorySource, logId: string): Promise<BuildLogEvents.BuildLog>
        getLogUrl(source: RepositorySource, logId: string): string
    }
}