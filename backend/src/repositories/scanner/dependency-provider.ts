import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { DependencyLookupProvider } from "./dependency-lookup-provider"
export interface DependencyProviderFactory {
    startSession(): DependencyProvider
}

export interface DependencyProvider {
    getVersion(ref: DependencyRef.Ref): Promise<Version | undefined>
}

export class DependencyProviderImpl implements DependencyProvider {

    constructor(private major: number | undefined, private lookupProvider: DependencyLookupProvider) { }


    async getVersion(ref: DependencyRef.Ref): Promise<Version | undefined> {
        return this.lookupProvider.getVersion(ref, this.major)
    }

}