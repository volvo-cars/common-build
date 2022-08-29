import { Refs } from "../../domain-model/refs"
import { BranchName } from "../build-system"
import { BuildState } from "./build-state"

export class ActiveBuildState {

    private constructor(public readonly sha: Refs.ShaRef, public readonly buildState: BuildState, public readonly targetBranch: BranchName) { }

    static create(sha: Refs.ShaRef, buildState: BuildState, targetBranch: BranchName): ActiveBuildState {
        return new ActiveBuildState(sha, buildState, targetBranch)
    }

    static deserialize(string: string): ActiveBuildState {
        const [sha, serializedBuiltState, targetBranch] = string.split("|")
        if (sha && serializedBuiltState && targetBranch) {
            return ActiveBuildState.create(Refs.ShaRef.create(sha), BuildState.deserialize(serializedBuiltState), targetBranch)
        } else {
            throw new Error(`Could not deserialize ActiveBuildState:${string}`)
        }
    }

    serialize(): string {
        return `${this.sha.sha}|${this.buildState.serialize()}|${this.targetBranch}`
    }
}