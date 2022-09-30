import { describe, expect, it, beforeEach, afterAll } from '@jest/globals'
import _ from 'lodash'
import { JobRef } from '../../../../src/domain-model/job-ref/job-ref'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { Update } from '../../../../src/system/build-system'
import { BuildState } from '../../../../src/system/queue/build-state'
import { buildQueue, Queue, QueueListener, QueueStatus } from '../../../../src/system/queue/queue'
import { MockIncrementTime } from '../../../helpers/mock-time'

describe("Testing queue functionality", () => {
    let redisFactory = createForTest()

    const createQueue = (): [Queue, MockIncrementTime, MockQueueListener] => {
        let mockTime = new MockIncrementTime()
        let queueListener = new MockQueueListener()
        let queue = buildQueue(redisFactory, mockTime, queueListener, { concurrency: 1 })
        return [queue, mockTime, queueListener]
    }

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    it("Register double Update.", async () => {
        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "playground/cynosure/cynosure_a"
        )
        let updateId = "Update-1"
        let update1 = <Update>{
            id: updateId,
            labels: ["label1"],
            sha: sha1,
            source: source,
            target: "master",
            title: "Some updated"
        }

        let [queue, mockTime, queueListener] = createQueue()
        let ref1 = new JobRef.UpdateRef(update1.id, update1.sha)
        await queue.upsert(update1)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.QUEUED)).toBe(true)
        expect((await queue.getStatus(update1.source, ref1))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.STARTING)).toBe(true)


        await queue.addStatus(source, ref1, QueueStatus.STARTED)
        expect((await queue.getStatus(source, ref1))?.current().status).toBe(QueueStatus.STARTED)

        let sha2 = Refs.ShaRef.create(_.repeat("2", 40))
        let update2 = <Update>{
            id: updateId,
            labels: ["label1"],
            sha: sha2,
            source: source,
            target: "master",
            title: "Some updated"
        }

        await queue.upsert(update2)
        let ref2 = new JobRef.UpdateRef(update2.id, update2.sha)
        expect((await queue.getStatus(source, ref2))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.ABORTED)).toBe(true) //Cancelled previous


    })

    it("Register double Update on different updateIds for serializing rebasing.", async () => {
        let sha1 = Refs.ShaRef.create(_.repeat("1", 40))
        let sha2 = Refs.ShaRef.create(_.repeat("2", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "playground/cynosure/cynosure_a"
        )
        let updateId1 = "Update-1"
        let update1 = <Update>{
            id: updateId1,
            labels: ["label1"],
            sha: sha1,
            source: source,
            target: "master",
            title: "Some updated"
        }
        let updateId2 = "Update-2"
        let update2 = <Update>{
            id: updateId2,
            labels: ["label1"],
            sha: sha2,
            source: source,
            target: "master",
            title: "Some updated"
        }

        let [queue, mockTime, queueListener] = createQueue()
        let ref1 = new JobRef.UpdateRef(update1.id, update1.sha)
        let ref2 = new JobRef.UpdateRef(update2.id, update2.sha)
        await queue.upsert(update1)
        expect((await queue.getStatus(source, ref1))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.STARTING)).toBe(true)

        await queue.addStatus(source, ref1, QueueStatus.STARTED)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.STARTED)).toBe(true)

        await queue.upsert(update2)
        expect(queueListener.hasEntry(source, ref2, QueueStatus.QUEUED)).toBe(true)
        expect(queueListener.hasEntry(source, ref2, QueueStatus.STARTING)).toBe(false)

        await queue.addStatus(source, ref1, QueueStatus.SUCCEESS)
        expect(queueListener.hasEntry(source, ref1, QueueStatus.SUCCEESS)).toBe(true)

        expect(queueListener.hasEntry(source, ref2, QueueStatus.STARTING)).toBe(true)
        await queue.addStatus(source, ref2, QueueStatus.STARTED)
        expect(queueListener.hasEntry(source, ref2, QueueStatus.STARTED)).toBe(true)
        await queue.addStatus(source, ref2, QueueStatus.SUCCEESS)
        expect(queueListener.hasEntry(source, ref2, QueueStatus.SUCCEESS)).toBe(true)


    })


})
type ExecutorQueueTypeStart = "start"
type ExecutorQueueTypeAbort = "abort"
type ExecutorQueueType = ExecutorQueueTypeStart | ExecutorQueueTypeAbort



class MockQueueListenerState {
    constructor(public source: RepositorySource, public ref: JobRef.Ref, public status: QueueStatus) { }

    equals(other: MockQueueListenerState): boolean {
        return this.source.equals(other.source) &&
            this.ref.equals(other.ref) &&
            this.status === other.status
    }

    toString(): string {
        return `${this.source}[${this.ref}]=[${this.status}]`
    }

}

class MockQueueListener implements QueueListener {
    log: MockQueueListenerState[] = []
    onQueueUpdated(source: RepositorySource, ref: JobRef.Ref, buildState: BuildState): Promise<void> {
        let state = new MockQueueListenerState(source, ref, buildState.current().status)
        this.log.push(state)
        return Promise.resolve()
    }

    hasEntry(source: RepositorySource, ref: JobRef.Ref, status: QueueStatus): boolean {
        let searchEntry = new MockQueueListenerState(source, ref, status)
        return _.findIndex(this.log, (entry: MockQueueListenerState) => {
            return searchEntry.equals(entry)
        }) >= 0
    }
    size(): number { return this.log.length }
}