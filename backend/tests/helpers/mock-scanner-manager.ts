import { Refs } from "../../src/domain-model/refs";
import { RepositorySource } from "../../src/domain-model/repository-model/repository-source";
import { DependencyRef } from "../../src/domain-model/system-config/dependency-ref";
import { Version } from "../../src/domain-model/version";
import { ScannerManager } from "../../src/repositories/scanner/scanner-manager";
export class MockScannerManager implements ScannerManager.Service {
    constructor(private sources: RepositorySource[] = []) { }

    getDependencyGraph(source: RepositorySource, sha: Refs.ShaRef): Promise<ScannerManager.DependencyGraph> {
        return Promise.resolve(<ScannerManager.DependencyGraph>{
            getProblems: (): ScannerManager.DependencyProblem[] => {
                return []
            },
            traverse: (visitor: (ref: DependencyRef.Ref, version: Version, depth: number) => void) => { }
        })
    }
    processBySource(...sources: RepositorySource[]): Promise<(Error | ScannerManager.ProcessResult)[]> {
        throw new Error("Method not implemented.");
    }
    processByReferences(...refs: DependencyRef.Ref[]): Promise<(Error | ScannerManager.ProcessResult)[]> {
        throw new Error("Method not implemented.");
    }
    registerDependencies(source: RepositorySource): Promise<void> {
        throw new Error("Method not implemented.");
    }

    processForDependencies(...dependencies: DependencyRef.Ref[]): Promise<RepositorySource[]> {
        return Promise.resolve(this.sources)
    }
}  