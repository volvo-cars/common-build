import { describe, expect, it } from '@jest/globals'
import { JobRef } from '../../../../src/domain-model/job-ref/job-ref'
import { Refs } from '../../../../src/domain-model/refs'
import { TestUtils } from '../../../helpers/test-utils'

describe("JobRef To/From Json", () => {

    it("Codec BranchRef", async () => {
        const branchRef = Refs.BranchRef.create("master")
        const shaRef = TestUtils.sha("0")
        const ref = new JobRef.BranchRef(branchRef, shaRef)

        const serialized = ref.serialize()

        console.log("Serialized", serialized)

        const ref2 = JobRef.Ref.deserialize(serialized)

        expect(ref2).toBeInstanceOf(JobRef.BranchRef)
        expect(ref2.sha.sha).toBe(shaRef.sha)
        const branchRef2 = <JobRef.BranchRef>ref2
        expect(branchRef2.branch.name).toBe(branchRef.name)
    })

    it("Codec UpdateRef", async () => {
        const updateId = "AAA"
        const shaRef = TestUtils.sha("0")

        const ref = new JobRef.UpdateRef(updateId, shaRef)

        const serialized = ref.serialize()

        console.log("Serialized", serialized)

        const ref2 = JobRef.Ref.deserialize(serialized)

        expect(ref2).toBeInstanceOf(JobRef.UpdateRef)
        expect(ref2.sha.sha).toBe(shaRef.sha)
        const branchRef2 = <JobRef.UpdateRef>ref2
        expect(branchRef2.updateId).toBe(updateId)
    })

})