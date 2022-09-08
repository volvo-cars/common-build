import { ProcessingStates } from "../../../src/cynosure/job-executor/processing-states"

describe("Verify ProcessStates", () => {
    it("Serialize / Deserialize Active", async () => {
        const active = new ProcessingStates.JobStarted("P1", "A1", 0)
        const serialized = active.serialize()
        const reactive = ProcessingStates.JobState.deserialize(serialized)
        expect(reactive).toBeInstanceOf(ProcessingStates.JobStarted)
        const started = <ProcessingStates.JobStarted>reactive
        expect(started.productId).toBe("P1")
        expect(started.activityId).toBe("A1")
    })

    it("Serialize / Deserialize Empty", async () => {
        const active = new ProcessingStates.JobQueued(0)
        const serialized = active.serialize()
        const reactive = ProcessingStates.JobState.deserialize(serialized)
        expect(reactive).toBeInstanceOf(ProcessingStates.JobQueued)
    })
})
