import { SystemFilesAccess } from "../system-files-access";
import { DependencyLookup } from "./dependency-lookup";
import { DependencyProviderImpl } from "./dependency-provider-impl";

export class DependencyLookupFactoryImpl implements DependencyLookup.Factory {
    constructor(private dependencyLookupCache: DependencyLookup.Cache, private systemFilesAccess: SystemFilesAccess) { }

    create(selector: DependencyLookup.DependencySelector): DependencyLookup.Provider {
        return new DependencyProviderImpl(this.dependencyLookupCache, selector, this.systemFilesAccess)
    }
}