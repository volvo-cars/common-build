import { describe, expect, it } from '@jest/globals'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositoryModel } from '../../../../src/domain-model/repository-model/repository-model'
import { Version } from '../../../../src/domain-model/version'
import { NormalizedModel, NormalizedModelUtil } from '../../../../src/repositories/repository/normalized-model'
import { getReadShas, getVersionSha, getWriteBranch } from '../../../../src/repositories/repository/repository-model-reader'
import _ from "lodash"
import { TestUtils } from '../../../helpers/test-utils'

describe("NormalizedModel", () => {

    it("Patch branch", async () => {
        [0, 10, 15, 200, 1000, 99].forEach(p => {
            const ref = Refs.BranchRef.create(`refs/heads/patch-${p}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef?.type).toBe(NormalizedModel.Type.PATCH_BRANCH)
        })
    })
    it("Main branch", async () => {
        ["master", "main"].forEach(m => {
            const ref = Refs.BranchRef.create(`refs/heads/${m}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef?.type).toBe(NormalizedModel.Type.MAIN_BRANCH)
        })
    })
    it("Release tag", async () => {
        ["v1.0.0", "v2.0.0"].forEach(v => {
            const ref = Refs.TagRef.create(`refs/tags/${v}`)
            const normalizedRef = NormalizedModelUtil.normalize(ref)
            expect(normalizedRef?.type).toBe(NormalizedModel.Type.RELEASE_TAG)
        })
    })
    it("Invalid branches", async () => {
        ["dev", "patch_0", "patch/1", "v1.0.0"].forEach(v => {
            const ref = Refs.BranchRef.create(`refs/heads/${v}`)
            expect(NormalizedModelUtil.normalize(ref)).toBeUndefined()
        })
    })
    it("Invalid tags", async () => {
        ["v1", "v1.0", "1.0.0"].forEach(v => {
            const ref = Refs.TagRef.create(`refs/tags/${v}`)
            expect(NormalizedModelUtil.normalize(ref)).toBeUndefined()
        })
    })
})
