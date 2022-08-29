import { describe, expect, it } from '@jest/globals'
import { Version } from '../../../../src/domain-model/version'
import { VersionContainer } from '../../../../src/repositories/scanner/version-container'

describe("Version Container", () => {


    it("Empty", async () => {
        const c = new VersionContainer([])
        expect(c.getHighest(undefined)).toBeUndefined()
        expect(c.getHighest(1)).toBeUndefined()
    })
    it("One version", async () => {
        const c = new VersionContainer([Version.fromSegments([1, 0, 0])])
        expect(c.getHighest(undefined)?.asString()).toBe("1.0.0")
        expect(c.getHighest(1)?.asString()).toBe("1.0.0")
        expect(c.getHighest(2)?.asString()).toBe("1.0.0")
        expect(c.getHighest(0)?.asString()).toBeUndefined()
    })
    it("Two version", async () => {
        const c = new VersionContainer([
            Version.fromSegments([1, 0, 0]),
            Version.fromSegments([1, 1, 0]),
            Version.fromSegments([2, 0, 0]),
            Version.fromSegments([2, 1, 0])
        ])
        expect(c.getHighest(undefined)?.asString()).toBe("2.1.0")
        expect(c.getHighest(1)?.asString()).toBe("1.1.0")
        expect(c.getHighest(2)?.asString()).toBe("2.1.0")
        expect(c.getHighest(3)?.asString()).toBe("2.1.0")
    })

})

