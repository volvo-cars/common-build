import exp from "constants"
import { Refs } from "../../../src/domain-model/refs"
import { TestUtils } from "../../helpers/test-utils"

describe("Test Ref", () => {
    it("Test ref parse branch with single name", async () => {
        const ref = Refs.create("refs/heads/myBranch")
        expect(ref.name).toBe("myBranch")
        expect(ref.type).toBe(Refs.Type.BRANCH)
    })
    it("Test ref parse branch with slash name", async () => {
        const ref = Refs.create("refs/heads/patch/1")
        expect(ref.name).toBe("patch/1")
        expect(ref.type).toBe(Refs.Type.BRANCH)
    })
    it("Test ref parse tag with slash name", async () => {
        const ref = Refs.create("refs/tags/release/1")
        expect(ref.name).toBe("release/1")
        expect(ref.type).toBe(Refs.Type.TAG)
    })
    it("Test ref parse remotes", async () => {
        const ref = Refs.create("refs/remotes/origin/release/1")
        expect(ref.name).toBe("release/1")
        expect(ref.type).toBe(Refs.Type.BRANCH)
    })
    it("Test ref parse sha", async () => {
        const ref = Refs.create("0123456789012345678901234567890123456789")
        expect(ref.name).toBe("0123456789012345678901234567890123456789")
        expect(ref.type).toBe(Refs.Type.SHA)
    })
    it("Test ref parse failure with unknown parent", async () => {
        expect(() => { return Refs.create("DUMMY/heads/patch/1") }).toThrowError()
        expect(Refs.tryCreate("DUMMY/heads/patch/1")).toBeUndefined()

    })
})