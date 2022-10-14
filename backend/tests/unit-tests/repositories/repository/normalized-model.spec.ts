import { describe, expect, it } from '@jest/globals'
import { Refs } from '../../../../src/domain-model/refs'
import { NormalizedModel, NormalizedModelUtil } from '../../../../src/repositories/repository/normalized-model'

describe("NormalizedModel", () => {

    it("Patch branch", async () => {
        [0, 10, 15, 200, 1000, 99].forEach(p => {
            const ref = Refs.createFromRemoteRef(`refs/heads/patch-${p}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef).toBeInstanceOf(NormalizedModel.PatchBranchRef)
        })
    })
    it("Main branch", async () => {
        ["master", "main"].forEach(m => {
            const ref = Refs.createFromRemoteRef(`refs/heads/${m}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef).toBeInstanceOf(NormalizedModel.MainBranchRef)
        })
    })
    it("Release tag", async () => {
        ["v1.0.0", "v2.0.0"].forEach(v => {
            const ref = Refs.createFromRemoteRef(`refs/tags/${v}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef).toBeInstanceOf(NormalizedModel.ReleaseTagRef)
        })
    })
    it("Invalid branches", async () => {
        ["dev", "patch_0", "patch/1", "v1.0.0"].forEach(v => {
            const ref = Refs.createFromRemoteRef(`refs/heads/${v}`)
            expect(NormalizedModelUtil.normalize(ref)).toBeUndefined()
        })
    })
    it("Invalid tags", async () => {
        ["v1", "v1.0", "1.0.0"].forEach(v => {
            const ref = Refs.createFromRemoteRef(`refs/tags/${v}`)
            expect(NormalizedModelUtil.normalize(ref)).toBeUndefined()
        })
    })
})
