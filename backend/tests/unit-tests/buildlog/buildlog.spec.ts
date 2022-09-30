import { BuildLogServiceImpl } from "../../../src/buildlog/buildlog-impl"
import { BuildLogEvents } from "../../../src/domain-model/buildlog-events/buildlog-events"
import { RepositorySource } from "../../../src/domain-model/repository-model/repository-source"
import { createForTest } from "../../../src/redis/redis-factory"
import { TestUtils } from "../../helpers/test-utils"

describe("Buildlog service", () => {

    const redisFactory = createForTest()

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    it("Test add single", async () => {
        const service = new BuildLogServiceImpl(redisFactory, "https://dummy-url")
        const source1 = new RepositorySource("a1", "a2")
        const source2 = new RepositorySource("b1", "b2")
        const source3 = new RepositorySource("c1", "c2")
        const ref1 = TestUtils.sha("000")
        const ref2 = TestUtils.sha("222")
        const before = new Date()
        await service.add("A1", BuildLogEvents.Level.DEBUG, source1, ref1)
        await service.add("A2", BuildLogEvents.Level.INFO, source1, ref1)

        await service.add("B1", BuildLogEvents.Level.DEBUG, source2, ref2)
        await service.add("B2", BuildLogEvents.Level.INFO, source2, ref2)
        await service.add("B3", BuildLogEvents.Level.ERROR, source2, ref2)

        const after = new Date()

        const log1 = await service.get(source1, ref1)
        expect(log1.entries.length).toBe(2)
        const l1_0 = log1.entries[1]
        const l1_1 = log1.entries[0]
        console.dir(log1, { depth: null })
        expect(l1_0.message).toBe("A1")
        expect(l1_0.timestamp.getTime()).toBeLessThan(after.getTime() + 1)
        expect(l1_0.timestamp.getTime()).toBeGreaterThan(before.getTime() - 1)
        expect(l1_1.message).toBe("A2")

        expect(l1_0.level).toBe(BuildLogEvents.Level.DEBUG)
        expect(l1_1.level).toBe(BuildLogEvents.Level.INFO)

        const log2 = await service.get(source2, ref2)
        expect(log2.entries.length).toBe(3)

        const log3 = await service.get(source3, ref2)
        expect(log3.entries.length).toBe(0)
    })

    it("Test with metaUrls", async () => {
        const service = new BuildLogServiceImpl(redisFactory, "https://dummy-url")
        const source1 = new RepositorySource("a1", "a2")
        const ref1 = TestUtils.sha("111")
        await service.add("A1", BuildLogEvents.Level.DEBUG, source1, ref1)
        const log1 = await service.get(source1, ref1)
        expect(log1.entries.length).toBe(1)
        expect(log1.metaUrls.size === 0)
        await service.add("A2", BuildLogEvents.Level.DEBUG, source1, ref1)
        await service.addMetaUrl("myUrl", "http://x.y.z", source1, ref1)
        const log2 = await service.get(source1, ref1)
        expect(log2.entries.length).toBe(2)
        expect(log2.metaUrls.size === 1)
        expect(log2.metaUrls).toEqual(new Map<string, string>([["myUrl", "http://x.y.z"]]))

    })
})