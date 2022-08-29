import exp from "constants"
import { createForTest } from "../../../src/redis/redis-factory"
import { RedisUtils } from "../../../src/redis/redis-utils"

describe("Test Redis Utils", () => {
    const redisFactory = createForTest()

    beforeEach(async () => {
        return redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        return redisFactory.shutdown()
    })

    it("Test successful", async () => {
        const redis = await redisFactory.get()
        const result = await RedisUtils.executeMulti(redis.multi().set("a", 1).set("b", 2))
        expect(result).toEqual(["OK", "OK"])

    })
    it("Test failure", async () => {
        const redis = await redisFactory.get()
        const outerResult = new Promise<void>((resolve, reject) => {
            RedisUtils.executeMulti(redis.multi().set("a", 1).zadd("a", 2, "dummy")).then(result => {
                reject("Should have failed")
            }).catch(e => {
                expect(e).toBeInstanceOf(Error)
                resolve()
            })
        })
        await outerResult
    })
})
