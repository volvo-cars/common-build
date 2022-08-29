import { Refs } from "../../src/domain-model/refs";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { Version } from "../../src/domain-model/version";
import { DependencyRef } from "../../src/domain-model/system-config/dependency-ref";
import { DependencyGraph, DependencyGraphProblem, ScannerManager } from "../../src/repositories/scanner/scanner-manager";

export class MockScannerManager implements ScannerManager {
    constructor(private sources: RepositorySource[] = []) { }
    allDependencies(source: RepositorySource, sha: Refs.ShaRef): Promise<DependencyGraph> {
        return Promise.resolve(<DependencyGraph>{
            getProblems: (): DependencyGraphProblem.Problem[] => {
                return []
            },
            traverse: (visitor: (ref: DependencyRef.Ref, version: Version, depth: number) => void) => { }
        })
    }
    processForDependencies(...dependencies: DependencyRef.Ref[]): Promise<RepositorySource[]> {
        return Promise.resolve(this.sources)
    }
}  