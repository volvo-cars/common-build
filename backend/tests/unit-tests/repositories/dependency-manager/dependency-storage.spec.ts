import { describe, expect, it, beforeEach, afterAll } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { DependencyRef } from '../../../../src/domain-model/system-config/dependency-ref'
import { createForTest } from '../../../../src/redis/redis-factory'
import { DependencyStoragImpl } from '../../../../src/repositories/dependency-manager/dependency-storage-impl'

describe("Testing raw-model repository", () => {
    let redisFactory = createForTest()

    beforeEach(async () => {
        return redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        return redisFactory.shutdown()
    })

    const equals = (c1: DependencyRef.Ref[], c2: DependencyRef.Ref[]): boolean => {
        if (c1.length === c2.length) {
            const c1ser = c1.map(c => { return c.serialize() }).sort()
            const c2ser = c2.map(c => { return c.serialize() }).sort()
            return _.isEqual(c1ser, c2ser)
        } else {
            return false
        }
    }

    const sortRefs = (refs: DependencyRef.Ref[]): DependencyRef.Ref[] => {
        return refs.map(c => { return c.serialize() }).sort().map(c => { return DependencyRef.deserialize(c) })
    }
    const sortSources = (sources: RepositorySource[]): RepositorySource[] => {
        return sources.map(c => { return c.serialize() }).sort().map(c => { return RepositorySource.deserialize(c) })
    }


    it("Add source dependencies for source. Do reverse lookup single", async () => {
        const service = new DependencyStoragImpl(redisFactory)
        const source1 = new RepositorySource("hello", "dummy")
        const source2 = new RepositorySource("hello", "dummy2")
        const source3 = new RepositorySource("hello", "dummy3")
        const source4 = new RepositorySource("hello", "dummy4")

        const refA = new DependencyRef.ArtifactRef("a", "a", "a/a")
        const refB = new DependencyRef.ArtifactRef("b", "b", "b/b")
        const refC = new DependencyRef.ArtifactRef("c", "c", "c/c")
        const refD = new DependencyRef.ArtifactRef("d", "d", "d/d")
        const refE = new DependencyRef.ArtifactRef("e", "e", "e/e")

        await service.update(source1, refA, refB, refC)
        await service.update(source2, refA, refB)
        await service.update(source3, refA)
        await service.update(source4, refD)

        expect(sortSources(await service.lookup(refA))).toEqual(sortSources([source1, source2, source3]))
        expect(sortSources(await service.lookup(refA, refA))).toEqual(sortSources([source1, source2, source3])) //Check double reference
        expect(sortSources(await service.lookup(refC, refD))).toEqual(sortSources([source1, source4]))
        expect(sortSources(await service.lookup(refD))).toEqual(sortSources([source4]))

        //Emptying
        await service.update(source1)
        expect(sortSources(await service.lookup(refC))).toEqual(sortSources([]))

        //Updating existing.
        await service.update(source1, refE)
        expect(sortSources(await service.lookup(refE))).toEqual(sortSources([source1]))
        expect(sortSources(await service.lookup(refA))).toEqual(sortSources([source2, source3]))
        expect(sortSources(await service.lookup(refA, refD))).toEqual(sortSources([source2, source3, source4]))

        //Emptying all
        await service.update(source1)
        await service.update(source2)
        await service.update(source3)
        await service.update(source4)
        expect(sortSources(await service.lookup(refA, refB, refC, refD, refE))).toEqual(sortSources([]))

        //Adding again
        await service.update(source1, refA, refB, refC)
        await service.update(source2, refA, refB)
        await service.update(source3, refA)
        await service.update(source4, refD)

        expect(sortSources(await service.lookup(refA))).toEqual(sortSources([source1, source2, source3]))
        expect(sortSources(await service.lookup(refA, refA))).toEqual(sortSources([source1, source2, source3])) //Check double reference
        expect(sortSources(await service.lookup(refC, refD))).toEqual(sortSources([source1, source4]))
        expect(sortSources(await service.lookup(refD))).toEqual(sortSources([source4]))


    })
})