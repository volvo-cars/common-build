import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { Version } from "../../domain-model/version";
import { DependencyProvider } from "./dependency-provider";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { LabelCriteria } from "./label-criteria";
import { ScanResult } from "./scanner";

export interface ScannerProvider {
    scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult>
    dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Dependency[]>
}

export class Dependency {
    constructor(public readonly ref: DependencyRef.Ref, public readonly version: Version) { }
}