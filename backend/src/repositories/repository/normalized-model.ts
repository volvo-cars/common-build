import { Refs } from "../../domain-model/refs"
import _ from 'lodash'
export class NormalizedModelUtil {

    private static releaseTag = /^v(\d+(?:\.\d+){2})$/
    private static patchBranch = /^patch-(\d+(?:\.\d+)*)$/
    private static majorTag = /^major-(\d+)$/
    private static mainBranch = /^(main|master)$/

    private constructor() { }

    private static convertToSegments(string: string): number[] {
        return string.split('.').map(s => { return parseInt(s) })
    }

    static normalize(ref: Refs.Ref): NormalizedModel.Ref | undefined {
        if (ref.type === Refs.Type.TAG) {
            const releaseMatch = ref.name.match(this.releaseTag)
            if (releaseMatch) {
                return new NormalizedModel.ReleaseTagRef(NormalizedModelUtil.convertToSegments(releaseMatch[1]))
            }
            const majorMatch = ref.name.match(this.majorTag)
            if (majorMatch) {
                return new NormalizedModel.MajorTagRef(parseInt(majorMatch[1]))
            }
        } else if (ref.type === Refs.Type.BRANCH) {
            const mainMatch = ref.name.match(this.mainBranch)
            if (mainMatch) {
                return new NormalizedModel.MainBranchRef(mainMatch[1])
            } else {
                const patchMatch = ref.name.match(this.patchBranch)
                if (patchMatch) {
                    return new NormalizedModel.PatchBranchRef(NormalizedModelUtil.convertToSegments(patchMatch[1]))
                }
            }
        } else {
            return undefined
        }
    }

}

export namespace NormalizedModel {
    export abstract class Ref {
        constructor(public type: Type) { }
    }
    export class PatchBranchRef extends Ref {
        constructor(public segments: number[]) {
            super(Type.PATCH_BRANCH)
        }
        full(): string {
            return this.segments.join('.')
        }
    }
    export class MainBranchRef extends Ref {
        constructor(public name: string) {
            super(Type.MAIN_BRANCH)
        }
    }
    export class ReleaseTagRef extends Ref {
        constructor(public segments: number[]) {
            super(Type.RELEASE_TAG)
        }
        full(): string {
            return this.segments.join('.')
        }
        parent(): string {
            return _.initial(this.segments).join('.')
        }
        patch(): number {
            return <number>_.last(this.segments)
        }

    }
    export class MajorTagRef extends Ref {
        constructor(public major: number) {
            super(Type.MAJOR_TAG)
        }
    }


    export enum Type {
        MAIN_BRANCH = "main_branch",
        PATCH_BRANCH = "patch_branch",
        RELEASE_TAG = "release",
        MAJOR_TAG = "major"
    }
}


