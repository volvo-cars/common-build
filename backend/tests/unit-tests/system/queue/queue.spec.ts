import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import { Console } from 'console'
import exp from 'constants'
import _ from 'lodash'
import { JobRef } from '../../../../src/domain-model/job-ref/job-ref'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { JobExecutor } from '../../../../src/system/job-executor/job-executor'
import { Queue } from '../../../../src/system/queue/queue'
import { QueueImpl } from '../../../../src/system/queue/queue-impl'
import { QueueRedis } from '../../../../src/system/queue/queue-redis'
import { QueueRedisImpl } from '../../../../src/system/queue/queue-redis-impl'
import { MockIncrementTime } from '../../../helpers/mock-time'
import { TestUtils } from '../../../helpers/test-utils'
import { TestWait } from '../../../helpers/test-wait'

describe("Testing queue push", () => {
    let redisFactory = createForTest()
    const time = new MockIncrementTime()

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    const createQueue = (): [QueueImpl, MockQueueListener] => {
        const listener = new MockQueueListener()
        const queue = new QueueImpl(redisFactory, time, listener, true)
        return [queue, listener]
    }

    it("Queue add one -> queued", async () => {
        const [queue, listener] = createQueue()

        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha1))

        await queue.push(job1)
        await TestWait.waitPromise(100)
        expect(listener.getState(job1)).toEqual(Queue.State.QUEUED)
    })

    it("Queue add one -> queued. Add second -> queued. First one cancelled.", async () => {
        const [queue, listener] = createQueue()

        let sha1 = TestUtils.sha("1")
        let sha2 = TestUtils.sha("2")
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha1))
        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha2))

        await queue.push(job1)
        await TestWait.waitPromise(100)
        expect(listener.getState(job1)).toEqual(Queue.State.QUEUED)

        await queue.push(job2)
        await TestWait.waitPromise(100)
        expect(listener.getState(job2)).toEqual(Queue.State.QUEUED)
        expect(listener.getState(job1)).toEqual(Queue.State.CANCELLED)

    })

    it("Queue add one -> queued. Start first. Add second -> queued. First one aborted.", async () => {
        const [queue, listener] = createQueue()

        let sha1 = TestUtils.sha("1")
        let sha2 = TestUtils.sha("2")
        let source = new RepositorySource(
            "csp-gerrit",
            "a"
        )
        const job1 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha1))
        const job2 = new JobExecutor.Key(source, new JobRef.UpdateRef("12", "master", sha2))

        await queue.push(job1)
        await TestWait.waitPromise(100)
        expect(listener.getState(job1)).toEqual(Queue.State.QUEUED)

        const started = await queue.start(2)
        await TestWait.waitPromise(100)
        expect(started.length).toBe(1)
        expect(started[0]).toEqual(job1)
        expect(listener.getState(job1)).toEqual(Queue.State.STARTING)

        await queue.push(job2)
        await TestWait.waitPromise(100)
        expect(listener.getState(job2)).toEqual(Queue.State.QUEUED)
        expect(listener.getState(job1)).toEqual(Queue.State.ABORTED)

    })


})

class MockQueueListener implements Queue.Listener {

    private state: Record<string, Queue.State> = {}

    onQueueTransition(job: JobExecutor.Key, state: Queue.State, previousState: Queue.State | undefined): void {
        this.state[job.serialize()] = state
    }

    getState(job: JobExecutor.Key): Queue.State | undefined {
        return this.state[job.serialize()]
    }

}
