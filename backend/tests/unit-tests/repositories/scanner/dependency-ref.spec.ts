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
})

