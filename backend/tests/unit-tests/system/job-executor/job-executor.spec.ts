import { RepositorySource } from "../../../../src/domain-model/repository-model/repository-source"
import { JobExecutor } from "../../../../src/system/job-executor/job-executor"
import { JobRef, JobRefType } from "../../../../src/system/job-executor/job-ref"
import { TestUtils } from "../../../helpers/test-utils"

describe("JobExecytor key", () => {
    const repo1 = new RepositorySource("A", "A")
    const repo2 = new RepositorySource("A", "B")
    const ref1 = JobRef.create(JobRefType.UPDATE, "A")
    const ref2 = JobRef.create(JobRefType.UPDATE, "B")
    const sha1 = TestUtils.sha("01010")
    const sha2 = TestUtils.sha("02020")

    it("Equals", async () => {
        const key = new JobExecutor.Key(repo1, ref1, sha1)
        expect(key.equals(key)).toBe(true)
        expect(new JobExecutor.Key(repo2, ref1, sha1).equals(key)).toBe(false)
        expect(new JobExecutor.Key(repo1, ref2, sha1).equals(key)).toBe(false)
        expect(new JobExecutor.Key(repo1, ref1, sha2).equals(key)).toBe(false)

    })
    it("Serialize/Deserialize", async () => {
        const key = new JobExecutor.Key(repo1, ref1, sha1)
        const serialized = key.serialize()
        const deserialized = JobExecutor.Key.deserialize(serialized)
        expect(key.equals(deserialized)).toBe(true)
    })
})
