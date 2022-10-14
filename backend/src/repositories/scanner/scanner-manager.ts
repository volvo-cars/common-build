import { Refs } from "../../domain-model/refs"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { DependencyRef } from "../../domain-model/system-config/dependency-ref"
import { Version } from "../../domain-model/version"
import { UpdateId } from "../../system/build-system"

export namespace ScannerManager {


    export interface Service {
        /**
         * 
         * @param source The source repository
         * @param sha The sha two resolve dependencies from 
         */
        getDependencyGraph(source: RepositorySource, sha: Refs.ShaRef): Promise<DependencyGraph>
        processBySource(...sources: RepositorySource[]): Promise<(ProcessResult | Error)[]>
        processByReferences(...refs: DependencyRef.Ref[]): Promise<(ProcessResult | Error)[]>
        registerDependencies(source: RepositorySource): Promise<void>
    }

    export abstract class ProcessResult { }

    export class SuccessfulProcessResult extends ProcessResult {
        constructor(readonly entries: ProcessResultEntry[]) {
            super()
        }
    }
    export class ErrorProcessResult extends ProcessResult {
        constructor(readonly error: Error) {
            super()
        }
    }


    export class ProcessResultEntry {
        constructor(major: number, result: string | Error, updateId: UpdateId | undefined) { }
    }

    export interface DependencyGraph {
        getProblems(): DependencyProblem[]
        traverse(visitor: (ref: DependencyRef.Ref, version: Version, depth: number) => void): void
    }

    export abstract class DependencyProblem {
        constructor(readonly message: string) { }
    }

    export class MultipleVersionsProblem extends DependencyProblem {
        constructor(readonly ref: DependencyRef.Ref, readonly versions: Version[]) {
            super(`Multiple versions of ${ref.toString()} (${versions.map(v => { return v.asString() }).join(", ")})`)
        }
    }
}



