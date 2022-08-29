import { describe, expect, it } from '@jest/globals'
import { Version } from '../../../../../src/domain-model/version'
import { RevisionUtil } from '../../../../../src/repositories/scanner/providers/revision-util'

describe("RevisionUtil", () => {


    it("Encode", async () => {
        expect(RevisionUtil.encodeVersion(Version.create("1.0.0"))).toBe("refs/tags/v1.0.0")
    })
    it("Extract v", async () => {
        expect(RevisionUtil.extractVersion("v1.0.0")?.asString()).toBe("1.0.0")
        expect(RevisionUtil.extractVersion("refs/tags/v1.0.0")?.asString()).toBe("1.0.0")
        expect(RevisionUtil.extractVersion("0.0.0")).toBeNull()
    })
})

