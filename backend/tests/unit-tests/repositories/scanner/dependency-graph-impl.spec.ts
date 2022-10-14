import { describe, expect, it } from '@jest/globals'
import { Version } from '../../../../src/domain-model/version'
import { DependencyGraphImpl } from '../../../../src/repositories/scanner/dependency-graph-impl'
import { DependencyRef } from '../../../../src/domain-model/system-config/dependency-ref'
import { JsonUtils } from '../../../../src/utils/json-utils'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { GraphTree } from '../../../../src/repositories/scanner/scanner-manager-impl'
import { ScannerManager } from '../../../../src/repositories/scanner/scanner-manager'

describe("DependencyGraphImpl", () => {

    const refA = new DependencyRef.GitRef(RepositorySource.createFromObject({
        id: "A",
        path: "a/a"
    }))
    const refB = new DependencyRef.GitRef(RepositorySource.createFromObject({
        id: "B",
        path: "b/b"
    }
    ))
    const refC = new DependencyRef.GitRef(RepositorySource.createFromObject({
        id: "C",
        path: "c/c"
    }
    ))
    const refD = new DependencyRef.GitRef(RepositorySource.createFromObject({
        id: "D",
        path: "d/d"
    }))
    const version100 = Version.create("1.0.0")
    const version110 = Version.create("1.1.0")
    const version120 = Version.create("1.2.0")

    it("Single graph", async () => {
        const graph = [
            new GraphTree(refA, version100, [])
        ]
        expect(new DependencyGraphImpl(graph).getProblems().length).toBe(0)
    })
    it("Nested graph nested samve version different ref", async () => {
        const graph = [
            new GraphTree(refA, version100, [
                new GraphTree(refB, version100, [])
            ])
        ]
        expect(new DependencyGraphImpl(graph).getProblems().length).toBe(0)
    })
    it("Nested graph nested samve version", async () => {
        const graph = [
            new GraphTree(refA, version100, [
                new GraphTree(refB, version100, [])
            ])
        ]
        expect(new DependencyGraphImpl(graph).getProblems().length).toBe(0)
    })
    it("Nested graph nested different version", async () => {
        const graph = [
            new GraphTree(refD, version100, [
                new GraphTree(refC, version100, [
                    new GraphTree(refA, version100, [])
                ]),
                new GraphTree(refB, version100, [
                    new GraphTree(refA, version110, [])
                ])
            ])
        ]
        const problems = new DependencyGraphImpl(graph).getProblems()
        console.log(JsonUtils.stringify(problems, 2))
        expect(problems.length).toBe(1)
        const problem = problems[0]
        expect(problem).toBeInstanceOf(ScannerManager.MultipleVersionsProblem)
        const multipleVersionProblem = <ScannerManager.MultipleVersionsProblem>problem
        expect(multipleVersionProblem.ref.serialize()).toBe(refA.serialize())
        expect(multipleVersionProblem.versions.find(v => { return v.asString() === "1.0.0" })).toBeDefined()
        expect(multipleVersionProblem.versions.find(v => { return v.asString() === "1.1.0" })).toBeDefined()
    })
})

