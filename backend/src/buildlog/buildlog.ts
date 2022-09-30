import { BuildLogEvents } from "../domain-model/buildlog-events/buildlog-events";
import { Refs } from "../domain-model/refs";
import { RepositorySource } from "../domain-model/repository-model/repository-source";

export namespace BuildLog {

    export interface Service {
        addMetaUrl(name: string, url: string, source: RepositorySource, sha: Refs.ShaRef): Promise<void>
        add(message: string, level: BuildLogEvents.Level, source: RepositorySource, sha: Refs.ShaRef): Promise<void>
        get(source: RepositorySource, sha: Refs.ShaRef): Promise<BuildLogEvents.BuildLog>
        getLogUrl(source: RepositorySource, sha: Refs.ShaRef): string
    }
}