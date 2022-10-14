import { Refs } from "../../../src/domain-model/refs"

describe("Test Ref", () => {
    it("Test ref parse branch with single name", async () => {
        const ref = Refs.createFromRemoteRef("refs/heads/myBranch")
        expect(ref.name).toBe("myBranch")
        expect(ref).toBeInstanceOf(Refs.BranchRef)
    })
    it("Test ref parse branch with slash name", async () => {
        const ref = Refs.createFromRemoteRef("refs/heads/patch/1")
        expect(ref.name).toBe("patch/1")
        expect(ref).toBeInstanceOf(Refs.BranchRef)
    })
    it("Test ref parse tag with slash name", async () => {
        const ref = Refs.createFromRemoteRef("refs/tags/release/1")
        expect(ref.name).toBe("release/1")
        expect(ref).toBeInstanceOf(Refs.TagRef)
    })
    it("Test ref parse remotes", async () => {
        const ref = Refs.createFromRemoteRef("refs/remotes/origin/release/1")
        expect(ref.name).toBe("release/1")
        expect(ref).toBeInstanceOf(Refs.BranchRef)
    })

    it("Test ref parse remotes meta config", async () => {
        const ref = Refs.createFromRemoteRef("refs/meta/config")
        expect(ref.name).toBe("meta/config")
        expect(ref).toBeInstanceOf(Refs.MetaConfigBranchRef)
    })

    it("Test ref parse failure with unknown parent", async () => {
        expect(() => { return Refs.createFromRemoteRef("DUMMY/heads/patch/1") }).toThrowError()
        expect(Refs.tryCreateFromRemoteRef("DUMMY/heads/patch/1")).toBeUndefined()

    })
})