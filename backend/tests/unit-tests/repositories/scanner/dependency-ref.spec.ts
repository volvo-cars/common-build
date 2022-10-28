import { describe, expect, it } from '@jest/globals'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { DependencyRef } from "../../../../src/domain-model/system-config/dependency-ref"

describe("DependencyRef", () => {


    it("Unique", async () => {
        const ref1 = new DependencyRef.GitRef(new RepositorySource("a", "dummy"))
        const ref2 = new DependencyRef.GitRef(new RepositorySource("b", "dummy"))
        const ref3 = new DependencyRef.ArtifactRef(
            "a",
            "a2",
            "b"
        )
        expect(DependencyRef.uniqueRefs([ref1, ref2, ref1, ref3, ref3])).toEqual([ref1, ref2, ref3])

    })
    it("Equals", async () => {
        const ref1 = new DependencyRef.GitRef(new RepositorySource("a", "dummy"))
        const ref1b = new DependencyRef.GitRef(new RepositorySource("a", "dummy"))
        const ref2 = new DependencyRef.GitRef(new RepositorySource("b", "dummy"))
        const ref3 = new DependencyRef.ArtifactRef(
            "a",
            "a2",
            "b"
        )
        const ref4 = new DependencyRef.ImageRef("a", "dummy")
        expect(ref1.equals(ref1)).toBe(true)
        expect(ref1.equals(ref1b)).toBe(true)
        expect(ref1.equals(ref2)).toBe(false)
        expect(ref1.equals(ref4)).toBe(false)
        expect(ref4.equals(ref4)).toBe(true)

    })


})

