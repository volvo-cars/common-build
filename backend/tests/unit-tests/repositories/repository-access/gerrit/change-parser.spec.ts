import { describe, expect, it } from '@jest/globals'
import { parseChange } from '../../../../../src/repositories/repository-access/gerrit/change-parser'
import { ensureDefined } from '../../../../../src/utils/ensures'

describe("Test parse gerrit change", () => {
    it("Test correct numeric", async () => {
        let parsed = parseChange("refs/changes/20/884120/1")
        expect(ensureDefined(parsed).changeNumber).toBe(884120)
        expect(ensureDefined(parsed).patchSetNumber).toBe(1)
    })
    it("Test correct numeric with patchSetNumber 0", async () => {
        let parsed = parseChange("refs/changes/20/884120/0")
        expect(ensureDefined(parsed).changeNumber).toBe(884120)
        expect(ensureDefined(parsed).patchSetNumber).toBe(0)
    })
    it("Test correct numeric with patchSetNumber meta", async () => {
        let parsed = parseChange("refs/changes/20/884120/meta")
        expect(ensureDefined(parsed).changeNumber).toBe(884120)
        expect(ensureDefined(parsed).patchSetNumber).toBe("meta")
    })
    it("Test bad", async () => {
        expect(parseChange("refs/changes/20/XX/0")).toBeNull()
        expect(parseChange("asdasd asdasd")).toBeNull()
    })
})
