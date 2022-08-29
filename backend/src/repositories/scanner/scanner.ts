import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { Version } from "../../domain-model/version";
import { DependencyProvider } from "./dependency-provider";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { LabelCriteria } from "./label-criteria";

export interface Scanner {
    dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Map<DependencyRef.Ref, Version[]>>
    scan(source: RepositorySource, major: number | undefined, ref: Refs.ShaRef, dependencyProvider: DependencyProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult>
}

export class ScanResult {
    constructor(public readonly allDependencies: DependencyRef.Ref[], public readonly updates: DependencyUpdate[]) { }
}

export class DependencyUpdate {
    constructor(public readonly label: string, public readonly path: string, public readonly content: string) { }
}




