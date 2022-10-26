import { DependencyRef } from "../../src/domain-model/system-config/dependency-ref";
import { Version } from "../../src/domain-model/version";
import { DependencyLookup } from "../../src/repositories/scanner/dependency-lookup";

export class MockDependencyProvider implements DependencyLookup.Provider {

    private lookups = new Map<string, string>()

    addLookup(ref: DependencyRef.Ref, returnVersion: Version): void {
        this.lookups.set(ref.serialize(), returnVersion.asString())
    }

    getVersion(ref: DependencyRef.Ref, current: Version): Promise<Version | undefined> {
        const definedVersion = this.lookups.get(ref.serialize())
        if (definedVersion) {
            return Promise.resolve(Version.parse(definedVersion) || undefined)
        } else {
            return Promise.resolve(undefined)
        }
    }
}