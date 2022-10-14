import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { Version } from "../../domain-model/version";
import { DependencyLookup } from "./dependency-lookup";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { LabelCriteria } from "./label-criteria";
import _ from "lodash";

export namespace Scanner {
    export interface Service {
        getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Map<DependencyRef.Ref, Version[]>>
        scan(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult>
    }

    export class ScanResult {
        constructor(public readonly allDependencies: DependencyRef.Ref[], public readonly dependencyUpdates: DependencyUpdate[]) { }

        updateLabels(): string[] {
            return _.uniq(this.dependencyUpdates.map(u => { return u.label }))
        }

        updatesByLabel(label: string): DependencyUpdate[] {
            return this.dependencyUpdates.filter(u => { return u.label === label })
        }

        private byLabel(): Map<string, DependencyUpdate[]> {
            return this.dependencyUpdates.reduce((acc, update) => {
                acc.set(update.label, [update, (acc.get(update.label) || [])].flat())
                return acc
            }, new Map<string, DependencyUpdate[]>())
        }
        toString(): string {
            return `ScanResult: updates:${this.dependencyUpdates.map(du => { return `[${du.label}]:${du.path}` }).join(",")}`
        }
    }
    export class DependencyUpdate {
        constructor(public readonly label: string, public readonly path: string, public readonly content: string) { }
        toString(): string {
            return `[${this.label}]:${this.path}`
        }
    }

    export interface Provider {
        scan(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<Scanner.ScanResult>
        getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Dependency[]>
    }

    export class Dependency {
        constructor(public readonly ref: DependencyRef.Ref, public readonly version: Version) { }
    }
}



