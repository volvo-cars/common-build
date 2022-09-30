import { BuildLog } from "../../src/buildlog/buildlog";
import { BuildLogEvents } from "../../src/domain-model/buildlog-events/buildlog-events";
import { Refs } from "../../src/domain-model/refs";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";

export class MockBuildLogService implements BuildLog.Service {
    addMetaUrl(url: string, name: string, source: RepositorySource, sha: Refs.ShaRef): Promise<void> {
        return Promise.resolve()
    }
    getLogUrl(source: RepositorySource, sha: Refs.ShaRef): string {
        return "https://dummy.com/xyz"
    }
    add(message: string, level: BuildLogEvents.Level, source: RepositorySource, sha: Refs.ShaRef): Promise<void> {
        return Promise.resolve()
    }
    get(source: RepositorySource, sha: Refs.ShaRef): Promise<BuildLogEvents.BuildLog> {
        return Promise.resolve(new BuildLogEvents.BuildLog([], new Map()))
    }

}  