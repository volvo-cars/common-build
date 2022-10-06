import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import { createForTest } from '../../../src/redis/redis-factory'
import { RedisLua } from '../../../src/redis/redis-lua'

describe("Testing raw-model repository", () => {
    let redisFactory = createForTest()

    beforeEach(async () => {
        return redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        return redisFactory.shutdown()
    })

    it("Test inline scripting", async () => {
        const redis = await redisFactory.get()
        const invoker = await RedisLua.create(redis, true, new RedisLua.Script("myScript", 1, "return {KEYS[1]}"))
        const result = await invoker.invokeScript<[string]>("myScript", "Hi there!")
        expect(result[0]).toBe("Hi there!")
    })
})