import { describe, expect, it } from '@jest/globals'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'

describe("Repository model spec", () => {

    it("Test empty then add then remove", async () => {
        const r1 = new RepositorySource("a1", "b1")
        const r2 = new RepositorySource("a2", "b2")
        const r3 = new RepositorySource("a3", "b3")

        const unique = RepositorySource.unique([r1, r2, r3, r1, r2, r3])
        expect(unique.length).toBe(3)
        expect(unique.find(r => { return r.isEqual(r1) })).toBeDefined()
        expect(unique.find(r => { return r.isEqual(r2) })).toBeDefined()
        expect(unique.find(r => { return r.isEqual(r3) })).toBeDefined()

    })
    it("Test asString and createFromString", async () => {
        const r1 = new RepositorySource("id1", "p1")
        const r2 = new RepositorySource("id2", "p2/p3")

        expect(RepositorySource.createFromString(r1.asString())).toEqual(r1)
        expect(RepositorySource.createFromString(r2.asString())).toEqual(r2)
        expect(() => { RepositorySource.createFromString("SomethingWithoutSlash") }).toThrowError()
    })
})