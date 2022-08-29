import { Refs } from "../../../domain-model/refs";
import { RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { DependencyProvider } from "../dependency-provider";
import { LabelCriteria } from "../label-criteria";
import { ScanResult } from "../scanner";
import { Dependency } from "../scanner-provider";

export class AbstractProvider {

    scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult> {
        throw "NI"
    }

    dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Dependency[]> {
        throw "NI"
    }



}