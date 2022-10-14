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
        if (ref instanceof Refs.TagRef) {
            const releaseMatch = ref.name.match(this.releaseTag)
            if (releaseMatch) {
                return new NormalizedModel.ReleaseTagRef(NormalizedModelUtil.convertToSegments(releaseMatch[1]))
            }
            const majorMatch = ref.name.match(this.majorTag)
            if (majorMatch) {
                return new NormalizedModel.MajorTagRef(parseInt(majorMatch[1]))
            }
        } else if (ref instanceof Refs.BranchRef) {
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
        constructor() { }
        abstract get isBranch(): boolean
    }

    export class PatchBranchRef extends Ref {
        constructor(public segments: number[]) {
            super()
        }
        override get isBranch(): boolean { return true }
        full(): string {
            return this.segments.join('.')
        }
    }
    export class MainBranchRef extends Ref {
        constructor(public name: string) {
            super()
        }
        override get isBranch(): boolean { return true }
    }
    export class ReleaseTagRef extends Ref {
        constructor(public segments: number[]) {
            super()
        }
        override get isBranch(): boolean { return false }
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
            super()
        }
        override get isBranch(): boolean { return false }
    }
}


