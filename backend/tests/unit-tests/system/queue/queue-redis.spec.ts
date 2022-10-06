import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import { Console } from 'console'
import exp from 'constants'
import _ from 'lodash'
import { JobRef } from '../../../../src/domain-model/job-ref/job-ref'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { JobExecutor } from '../../../../src/system/job-executor/job-executor'
import { QueueRedis } from '../../../../src/system/queue/queue-redis'
import { QueueRedisImpl } from '../../../../src/system/queue/queue-redis-impl'
import { MockIncrementTime } from '../../../helpers/mock-time'
import { TestUtils } from '../../../helpers/test-utils'

describe("Testing queue push", () => {
    let redisFactory = createForTest()
    const time = new MockIncrementTime()

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    const createQueueRedis = (): QueueRedisImpl => {
        return new QueueRedisImpl(redisFactory, time, true)
    }

    it("Push same update twice. Not Started. First one cancelled", async () => {
        const queue = createQueueRedis()

        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let sha2 = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha1))

        const result1 = await queue.push(job1)
        expect(result1.abort).toBeUndefined()
        expect(result1.cancel).toBeUndefined()
        expect(result1.localQueueSize).toBe(1)


        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha2))
        const result2 = await queue.push(job2)
        expect(result2.abort).toBeUndefined()
        expect(result2.cancel?.jobRef.sha).toEqual(sha1)
        expect(result2.localQueueSize).toBe(1)
    })

    it("Push same update twice. Started. First one aborted", async () => {
        console.log("test 2")
        const queue = createQueueRedis()

        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let sha2 = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha1))

        const result1 = await queue.push(job1)
        expect(result1.abort).toBeUndefined()
        expect(result1.cancel).toBeUndefined()
        expect(result1.localQueueSize).toBe(1)

        const started1 = await queue.start(2)
        expect(started1.length).toBe(1)
        expect(started1[0].jobRef.sha).toEqual(sha1)

        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha2))
        const result2 = await queue.push(job2)
        expect(result2.cancel).toBeUndefined()
        expect(result2.abort?.jobRef.sha).toEqual(sha1)
        expect(result2.localQueueSize).toBe(1)

        const started2 = await queue.start(2)
        expect(started2.length).toBe(1)
        expect(started2[0].jobRef.sha).toEqual(sha2)

        const completed1 = await queue.complete(job2)
        expect(completed1).toBe(true)

        const started3 = await queue.start(2)
        expect(started3.length).toBe(0)

    })

    it("Push different updates on different queue twice none cancelled", async () => {
        console.log("test 3")
        const queue = createQueueRedis()

        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let sha2 = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("1", "master", sha1))

        const result1 = await queue.push(job1)
        expect(result1.abort).toBeUndefined()
        expect(result1.cancel).toBeUndefined()
        expect(result1.localQueueSize).toBe(1)

        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("2", "master2", sha2))
        const result2 = await queue.push(job2)
        expect(result2.abort).toBeUndefined()
        expect(result2.cancel).toBeUndefined()
        expect(result2.localQueueSize).toBe(1)

        const job3 = new JobExecutor.Key(source, new JobRef.UpdateRef("2", "master3", sha2))
        const result3 = await queue.push(job3)
        expect(result3.abort).toBeUndefined()
        expect(result3.cancel).toBeUndefined()
        expect(result3.localQueueSize).toBe(1)


        const started1 = await queue.start(2)
        expect(started1.length).toBe(2)

        const started2 = await queue.start(2)
        expect(started2.length).toBe(1)

        const complete1 = await queue.complete(job1)
        const complete2 = await queue.complete(job2)

        expect(complete1).toBe(true)
        expect(complete2).toBe(true)

        const started3 = await queue.start(2)
        expect(started3.length).toBe(0)

        const completed3 = await queue.complete(job3)
        expect(completed3).toBe(true)

        const started4 = await queue.start(2)
        expect(started4.length).toBe(0)



    })

    it("Push and complete one change then repeat another time on same queue.", async () => {
        console.log("test 4")
        const queue = createQueueRedis()

        let sha1 = TestUtils.sha("1")
        let sha2 = TestUtils.sha("2")
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("1", "master", sha1))

        const result1 = await queue.push(job1)
        expect(result1.abort).toBeUndefined()
        expect(result1.cancel).toBeUndefined()
        expect(result1.localQueueSize).toBe(1)

        const started1 = await queue.start(2)
        expect(started1.length).toBe(1)
        expect(started1[0]).toEqual(job1)

        const completed1 = await queue.complete(job1)
        expect(completed1).toBe(true)

        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("2", "master", sha2))

        const result2 = await queue.push(job2)
        expect(result2.abort).toBeUndefined()
        expect(result2.cancel).toBeUndefined()
        expect(result2.localQueueSize).toBe(1)

        const started2 = await queue.start(2)
        expect(started2.length).toBe(1)
        expect(started2[0]).toEqual(job2)

        const completed2 = await queue.complete(job2)
        expect(completed2).toBe(true)

    })

})
