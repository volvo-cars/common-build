import { describe, expect, it, beforeEach, afterAll } from '@jest/globals'
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

    it("Test empty then add then remove", async () => {
        const service = new DependencyStoragImpl(redisFactory)
        const source1 = new RepositorySource("hello", "dummy")
        const source2 = new RepositorySource("hello", "dummy2")
        const ref1 = new DependencyRef.GitRef(source1)
        const ref2 = new DependencyRef.GitRef(source2)

        expect(await service.isKnown(source1)).toEqual([false])
        expect(await service.lookup(ref1)).toEqual([])
        await service.update(source1, ref1, ref2)
        expect(await service.isKnown(source1)).toEqual([true])
        expect(await service.lookup(ref1)).toEqual([source1])
        expect(await service.lookup(ref2)).toEqual([source1])



    })
})