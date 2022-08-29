import { describe, expect, it, afterAll, beforeEach } from '@jest/globals'
import _ from 'lodash'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { createActiveRepositories } from '../../../../src/system/queue/active-repositories'

describe("ActiveRepositories", () => {
    let redisFactory = createForTest()

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    it("Test empty", async () => {
        const activeRepositories = createActiveRepositories(redisFactory)
        expect(await activeRepositories.activeRepositories()).toEqual([])
    })

    it("Test add and exists", async () => {
        const activeRepositories = createActiveRepositories(redisFactory)
        const source1 = new RepositorySource("csp-gerrit", "a/b")
        const source2 = new RepositorySource("csp-gerrit", "d/d")

        expect(await activeRepositories.isActive(source1)).toBe(false)
        expect(await activeRepositories.isActive(source2)).toBe(false)
        await activeRepositories.addActiveRepositories(source1)
        expect(await activeRepositories.isActive(source1)).toBe(true)
        expect(await activeRepositories.isActive(source2)).toBe(false)
        await activeRepositories.addActiveRepositories(source2)
        expect(await activeRepositories.isActive(source1)).toBe(true)
        expect(await activeRepositories.isActive(source2)).toBe(true)

        expect(await activeRepositories.activeRepositories()).toContainEqual(source1)
        expect(await activeRepositories.activeRepositories()).toContainEqual(source2)

        await activeRepositories.removeActiveRepositories(source1)
        expect(await activeRepositories.isActive(source1)).toBe(false)
        expect(await activeRepositories.isActive(source2)).toBe(true)

        await activeRepositories.removeActiveRepositories(source2)
        expect(await activeRepositories.isActive(source1)).toBe(false)
        expect(await activeRepositories.isActive(source2)).toBe(false)

    })

}) 