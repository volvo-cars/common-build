import { describe, expect, it, beforeEach, afterAll } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { Update } from '../../../../src/system/build-system'
import { JobRef, JobRefType } from '../../../../src/system/job-executor/job-ref'
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
        let ref = JobRef.create(JobRefType.UPDATE, updateId)
        await queue.upsert(update1)
        expect(queueListener.hasEntry(source, JobRef.create(JobRefType.UPDATE, update1.id), update1.sha, QueueStatus.QUEUED)).toBe(true)
        expect((await queue.getStatus(update1.source, ref, update1.sha))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref, update1.sha, QueueStatus.STARTING)).toBe(true)


        await queue.addStatus(source, ref, update1.sha, QueueStatus.STARTED)
        expect((await queue.getStatus(source, ref, update1.sha))?.current().status).toBe(QueueStatus.STARTED)

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
        expect((await queue.getStatus(source, JobRef.create(JobRefType.UPDATE, update2.id), update2.sha))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref, update1.sha, QueueStatus.ABORTED)).toBe(true)


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
        let ref1 = JobRef.create(JobRefType.UPDATE, updateId1)
        let ref2 = JobRef.create(JobRefType.UPDATE, updateId2)
        await queue.upsert(update1)
        expect((await queue.getStatus(source, ref1, update1.sha))?.current().status).toBe(QueueStatus.STARTING)
        expect(queueListener.hasEntry(source, ref1, update1.sha, QueueStatus.STARTING)).toBe(true)

        await queue.addStatus(source, ref1, update1.sha, QueueStatus.STARTED)
        expect(queueListener.hasEntry(source, ref1, update1.sha, QueueStatus.STARTED)).toBe(true)

        await queue.upsert(update2)
        expect(queueListener.hasEntry(source, ref2, update2.sha, QueueStatus.QUEUED)).toBe(true)
        expect(queueListener.hasEntry(source, ref2, update2.sha, QueueStatus.STARTING)).toBe(false)

        await queue.addStatus(source, ref1, update1.sha, QueueStatus.SUCCEESS)
        expect(queueListener.hasEntry(source, ref1, update1.sha, QueueStatus.SUCCEESS)).toBe(true)

        expect(queueListener.hasEntry(source, ref2, update2.sha, QueueStatus.STARTING)).toBe(true)
        await queue.addStatus(source, ref2, update2.sha, QueueStatus.STARTED)
        expect(queueListener.hasEntry(source, ref2, update2.sha, QueueStatus.STARTED)).toBe(true)
        await queue.addStatus(source, ref2, update2.sha, QueueStatus.SUCCEESS)
        expect(queueListener.hasEntry(source, ref2, update2.sha, QueueStatus.SUCCEESS)).toBe(true)


    })


})
type ExecutorQueueTypeStart = "start"
type ExecutorQueueTypeAbort = "abort"
type ExecutorQueueType = ExecutorQueueTypeStart | ExecutorQueueTypeAbort



class MockQueueListenerState {
    constructor(public source: RepositorySource, public ref: JobRef, public sha: Refs.ShaRef, public status: QueueStatus) { }

    equals(other: MockQueueListenerState): boolean {
        return this.source.id === other.source.id && this.source.path === other.source.path &&
            this.ref.type === other.ref.type && this.ref.ref === other.ref.ref &&
            this.sha.sha === other.sha.sha && this.status === other.status
    }

    toString(): string {
        return `${this.source.id}/${this.source.path}[${this.sha}]=[${this.status}]`
    }

}

class MockQueueListener implements QueueListener {
    log: MockQueueListenerState[] = []
    onQueueUpdated(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, buildState: BuildState): Promise<void> {
        let state = new MockQueueListenerState(source, ref, sha, buildState.current().status)
        this.log.push(state)
        return Promise.resolve()
    }

    hasEntry(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef, status: QueueStatus): boolean {
        let searchEntry = new MockQueueListenerState(source, ref, sha, status)
        return _.findIndex(this.log, (entry: MockQueueListenerState) => {
            return searchEntry.equals(entry)
        }) >= 0
    }
    size(): number { return this.log.length }
}