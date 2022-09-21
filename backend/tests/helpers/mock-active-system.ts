import _ from "lodash";
import { ActiveSystem } from "../../src/active-system/active-system";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";

export class MockActiveSystem implements ActiveSystem.System {
    public readonly systemId: string = "testing"
    constructor(private activeRepos: RepositorySource[]) { }
    isActive(source: RepositorySource): Promise<boolean> {
        return Promise.resolve(this.activeRepos.length === 0 || this.activeRepos.find(r => { return r.isEqual(source) }) ? true : false)
    }
    availableSystems(): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

}