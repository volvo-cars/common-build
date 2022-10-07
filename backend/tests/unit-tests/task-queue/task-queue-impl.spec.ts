import { TaskQueueImpl } from "../../../src/task-queue/task-queue-impl"
import { Duration, Time } from "../../../src/task-queue/time"
import { createForTest } from "../../../src/redis/redis-factory"
import { TestWait } from "../../helpers/test-wait"
import { MockTime } from "../../helpers/mock-time"

describe("Task queue", () => {
    const redisFactory = createForTest()
    const time = new MockTime()
    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    it("Test poll empty", async () => {
        const queue = new TaskQueueImpl("test", redisFactory, time)
        const expired = await queue.popExpired(1, Time.now())
        expect(expired.entries.length).toBe(0)
        expect(expired.hasMore).toBe(false)
    })

    it("Push and retrive 1 expired entry", async () => {
        const queue = new TaskQueueImpl("test", redisFactory, time)
        await queue.upsert("A", Duration.NO_DURATION, "My Data")
        await TestWait.waitPromise(500)
        const expired = await queue.popExpired(2, Time.now())
        expect(expired.entries.length).toBe(1)
        const entry = expired.entries[0]
        expect(entry.data.indexOf("My Data")).toBe(0)
        expect(entry.data.length).toBe(1)
        expect(expired.hasMore).toBe(false)

        const expired2 = await queue.popExpired(2, Time.now())
        expect(expired2.entries.length).toBe(0)
        expect(expired2.hasMore).toBe(false)
    })


    it("Push twice and retrive 1 expired entry", async () => {
        const queue = new TaskQueueImpl("test", redisFactory, time)
        await queue.upsert("A", Duration.NO_DURATION, "My Data")
        await queue.upsert("A", Duration.NO_DURATION, "My Data2")
        const wait = await TestWait.waitPromise(500)
        const expired = await queue.popExpired(2, Time.now())
        expect(expired.entries.length).toBe(1)
        const entry = expired.entries[0]
        expect(entry.data.length).toBe(2)
        expect(entry.data.indexOf("My Data")).toBe(0)
        expect(entry.data.indexOf("My Data2")).toBe(1)
        expect(expired.hasMore).toBe(false)

        const expired2 = await queue.popExpired(2, Time.now())
        expect(expired2.entries.length).toBe(0)
        expect(expired2.hasMore).toBe(false)
    })

    it("Push twice and with retrieve between", async () => {
        const queue = new TaskQueueImpl("test", redisFactory, time)
        await queue.upsert("A", Duration.NO_DURATION, "My Data")
        await TestWait.waitPromise(500)
        const expired = await queue.popExpired(2, Time.now())
        expect(expired.entries.length).toBe(1)
        const entry = expired.entries[0]
        expect(entry.data.indexOf("My Data")).toBe(0)
        expect(expired.hasMore).toBe(false)

        const emptyExire = await queue.popExpired(1, Time.now())
        expect(emptyExire.entries.length).toBe(0)
        expect(emptyExire.hasMore).toBe(false)

        await queue.upsert("A", Duration.NO_DURATION, "My Data2")
        await TestWait.waitPromise(500)
        const expired2 = await queue.popExpired(2, Time.now())
        expect(expired.entries.length).toBe(1)
        const entry2 = expired2.entries[0]
        expect(entry2.data.indexOf("My Data2")).toBe(1)
        expect(entry2.data.indexOf("My Data")).toBe(0)
        expect(expired.hasMore).toBe(false)
    })

    it("Push to different uids", async () => {
        const queue = new TaskQueueImpl("test", redisFactory, time)
        await queue.upsert("A", Duration.NO_DURATION, "My DataA")
        await queue.upsert("B", Duration.NO_DURATION, "My DataB")
        await TestWait.waitPromise(500)
        const expired = await queue.popExpired(2, Time.now())
        expect(expired.entries.length).toBe(2)
        const entryA = expired.entries.find(e => { return e.uid === "A" })
        const entryB = expired.entries.find(e => { return e.uid === "B" })

        expect(entryA).toBeDefined()
        expect(entryA?.data.length).toBe(1)

        expect(entryB).toBeDefined()
        expect(entryB?.data.length).toBe(1)
        expect(expired.hasMore).toBe(true)

    })
})
