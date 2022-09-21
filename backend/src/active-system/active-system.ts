import { RepositorySource } from "../domain-model/repository-model/repository-source";

export namespace ActiveSystem {
    export interface System {
        readonly systemId: string
        isActive(source: RepositorySource): Promise<boolean>
        availableSystems(): Promise<string[]>
    }
}