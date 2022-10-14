import 'jest'
import { Version } from '../../../src/domain-model/version'
import { ensureDefined } from '../../../src/utils/ensures'

describe("Version tests", () => {
    it("Empty version fails", async () => {
        let version = Version.parse("")
        expect(version).toBeNull
    })
    it("Version with one segment fails", async () => {
        let version = Version.parse("1")
        expect(version).toBeNull
    })
    it("Version with 2 segments pass", async () => {
        let version = ensureDefined(Version.parse("1.2"), "Should be defined")
        expect(version.segments).toEqual([1, 2])
        expect(version.asString()).toBe("1.2")
    })
    it("Version with 3 segments pass", async () => {
        let version = ensureDefined(Version.parse("1.2.3"), "Should be defined")
        expect(version.segments).toEqual([1, 2, 3])
        expect(version.asString()).toBe("1.2.3")
    })
    it("Version with 3 segments with non-numeric fails", async () => {
        let version = Version.parse("1.a.3")
        expect(version).toBeNull
    })
    it("Version with segments of 1000+", async () => {
        let version = Version.parse("1001.2002.3003")
        expect(version?.segments).toEqual([1001, 2002, 3003])
    })

    it("Same version is equal", async () => {
        let version = ensureDefined(Version.parse("1.0.0"), "Should be defined")
        expect(version?.compare(version)).toBe(0)
    })
    it("Two versions with same value are equal", async () => {
        let version1 = ensureDefined(Version.parse("1.0.0"), "Should be defined")
        let version2 = ensureDefined(Version.parse("1.0.0"), "Should be defined")
        expect(version1.compare(version2)).toBe(0)
    })
    it("Two versions same length but different", async () => {
        let version1 = ensureDefined(Version.parse("1.0.0"), "Should be defined")
        let version2 = ensureDefined(Version.parse("1.1.0"), "Should be defined")
        expect(version1.compare(version2)).toBeLessThan(0)
        expect(version2.compare(version1)).toBeGreaterThan(0)
    })
    it("Two versions shorter higher", async () => {
        let version1 = ensureDefined(Version.parse("1.1"), "Should be defined")
        let version2 = ensureDefined(Version.parse("1.0.1"), "Should be defined")
        expect(version1.compare(version2)).toBeGreaterThan(0)
        expect(version2.compare(version1)).toBeLessThan(0)
    })
    it("Two versions shorter lower", async () => {
        let version1 = ensureDefined(Version.parse("1.0"), "Should be defined")
        let version2 = ensureDefined(Version.parse("1.1.0"), "Should be defined")
        expect(version1.compare(version2)).toBeLessThan(0)
        expect(version2.compare(version1)).toBeGreaterThan(0)
    })



})