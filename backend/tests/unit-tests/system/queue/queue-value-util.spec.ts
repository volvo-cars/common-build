import { describe, expect, it } from '@jest/globals'
import 'jest'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { JobRef, JobRefType } from '../../../../src/system/job-executor/job-ref'
import { deserializeQueueValue, serializeQueueValue } from '../../../../src/system/queue/queue-value-util'

describe("Queue value utils", () => {
    it("Serialize + Deserialize", async () => {
        let source = new RepositorySource("a", "b")
        let ref = JobRef.create(JobRefType.UPDATE, "c")
        let serialized = serializeQueueValue(source, ref)
        let [resultSource, resultRef] = deserializeQueueValue(serialized)
        expect(resultSource.id).toBe("a")
        expect(resultSource.path).toBe("b")
        expect(resultRef.type).toBe(JobRefType.UPDATE)
        expect(resultRef.ref).toBe("c")
    })
}) 