import { ActiveSystemUtil } from "../../../src/active-system/active-system-util"
import { ProcessingStates } from "../../../src/cynosure/job-executor/processing-states"

describe("Test active system utils", () => {
    it("Test functions", async () => {
        const DEFAULT_SYSTEM = "STAGING"
        expect(ActiveSystemUtil.isRepositoryOnCurrentSystem(undefined, DEFAULT_SYSTEM, "a")).toBe(false)
        expect(ActiveSystemUtil.isRepositoryOnCurrentSystem(undefined, DEFAULT_SYSTEM, DEFAULT_SYSTEM)).toBe(true)
        expect(ActiveSystemUtil.isRepositoryOnCurrentSystem(DEFAULT_SYSTEM, DEFAULT_SYSTEM, DEFAULT_SYSTEM)).toBe(true)
        expect(ActiveSystemUtil.isRepositoryOnCurrentSystem("a", DEFAULT_SYSTEM, "a")).toBe(true)
        expect(ActiveSystemUtil.isRepositoryOnCurrentSystem("b", DEFAULT_SYSTEM, "a")).toBe(false)
    })
})
