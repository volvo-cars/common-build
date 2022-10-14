import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { RepositoryImpl } from "../repository/repository"
import { VersionContainer } from "./version-container"

export namespace DependencyLookup {

    export class CacheEntry {
        constructor(readonly container: VersionContainer, readonly origin: RepositorySource | undefined) { }
    }

    export interface Cache {
        getAllVersions(ref: DependencyRef.Ref): Promise<CacheEntry | undefined>
        invalidate(...refs: DependencyRef.Ref[]): Promise<void>
    }

    export interface Provider {
        getVersion(ref: DependencyRef.Ref, current: Version): Promise<Version | undefined>
    }

    export interface Factory {
        create(selector: DependencySelector): Provider
    }

    export interface DependencySelector {
        pick(versions: VersionContainer, current: Version, serieName: string | undefined): Version | undefined
    }

    /**
     * If dependency is in the same major serie synch on it otherwise select highest
     */
    export class HighestInMajorOrHighestDependencySelector implements DependencySelector {
        constructor(readonly targetMajor: number, readonly targetSerie: string) { }
        pick(versions: VersionContainer, current: Version, serieName: string | undefined): Version | undefined {
            if (this.targetSerie === serieName) {
                return versions.getHighest(this.targetMajor)
            } else {
                return versions.getHighest(undefined)
            }
        }
    }

    export class HighestInMajorOrKeepMajorDependencySelector implements DependencySelector {
        constructor(readonly targetMajor: number, readonly targetSerie: string) { }
        pick(versions: VersionContainer, current: Version, serieName: string | undefined): Version | undefined {
            if (this.targetSerie === serieName) {
                return versions.getHighest(this.targetMajor)
            } else {
                return versions.getHighest(current.major)
            }
        }
    }

    /**
     * Upgrades to highest version.
     */
    export class HighestDependencySelector implements DependencySelector {
        public static readonly INSTANCE = new HighestDependencySelector()
        pick(versions: VersionContainer, current: Version, serieName: string | undefined): Version | undefined {
            return versions.getHighest(undefined)
        }
    }

    /**
     * Upgrades to highest version of in the current version's major.
     */
    export class HighestMinorKeepMajorDependencySelector implements DependencySelector {
        public static readonly INSTANCE = new HighestDependencySelector()
        pick(versions: VersionContainer, current: Version, serieName: string | undefined): Version | undefined {
            return versions.getHighest(current.major)
        }
    }

}

