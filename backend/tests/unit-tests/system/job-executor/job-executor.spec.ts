import { JobRef } from "../../../../src/domain-model/job-ref/job-ref"
import { RepositorySource } from "../../../../src/domain-model/repository-model/repository-source"
import { JobExecutor } from "../../../../src/system/job-executor/job-executor"
import { TestUtils } from "../../../helpers/test-utils"

describe("JobExecytor key", () => {
    const repo1 = new RepositorySource("A", "A")
    const repo2 = new RepositorySource("A", "B")
    const sha1 = TestUtils.sha("01010")
    const sha2 = TestUtils.sha("02020")
    const ref1 = new JobRef.UpdateRef("A", "dummy", sha1)
    const ref2 = new JobRef.UpdateRef("B", "dummy", sha2)


    it("Equals", async () => {
        const key = new JobExecutor.Key(repo1, ref1)
        expect(new JobExecutor.Key(repo1, ref1).equals(key)).toBe(true)
        expect(new JobExecutor.Key(repo2, ref1).equals(key)).toBe(false)
        expect(new JobExecutor.Key(repo1, ref2).equals(key)).toBe(false)
        expect(new JobExecutor.Key(repo2, ref2).equals(key)).toBe(false)

    })
    it("Serialize/Deserialize", async () => {
        const key = new JobExecutor.Key(repo1, ref1)
        const serialized = key.serialize()
        const deserialized = JobExecutor.Key.deserialize(serialized)
        expect(key.equals(deserialized)).toBe(true)
    })
})
