import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../src/domain-model/refs'
import { RepositorySource } from '../../../src/domain-model/repository-model/repository-source'
import { BuildConfig } from '../../../src/domain-model/system-config/build-config'
import { createLogger, loggerName } from '../../../src/logging/logging-factory'
import { createForTest } from "../../../src/redis/redis-factory"
import { RepositoryFactoryImpl } from '../../../src/repositories/repository/repository-factory'
import { BuildSystem, BuildSystemImpl, Update } from "../../../src/system/build-system"
import { JobExecutor } from '../../../src/system/job-executor/job-executor'
import { JobRef, JobRefType } from "../../../src/system/job-executor/job-ref"
import { ActiveRepositories } from '../../../src/system/queue/active-repositories'
import { QueueStatus } from "../../../src/system/queue/queue"
import { ensureDefined } from "../../../src/utils/ensures"
import { MockLocalGitFactory } from "../../helpers/mock-local-git-factory"
import { MockPublisherManager } from '../../helpers/mock-publisher-manager'
import { MockRepositoryAccessFactory } from '../../helpers/mock-repository-access-factory'
import { MockScannerManager } from '../../helpers/mock-scanner-manager'
import { MockIncrementTime } from "../../helpers/mock-time"
import { TestWait } from '../../helpers/test-wait'

const logger = createLogger(loggerName(__filename))

describe("Testing queue functionality", () => {
    const redisFactory = createForTest()

    const gateYml =
        `dummy: hello

`
    const createSystem = (): [BuildSystem, MockIncrementTime, MockJobExecutor] => {
        let mockTime = new MockIncrementTime()
        let jobExecutor = new MockJobExecutor()
        let repositoryAccessFactory = new MockRepositoryAccessFactory({ [BuildConfig.FILE_PATH]: gateYml })
        let repositoryFactory = new RepositoryFactoryImpl(redisFactory, repositoryAccessFactory)
        let activeRepositories = new MockActiveRepositories()
        let scannerManager = new MockScannerManager()
        let publisherManager = new MockPublisherManager()
        let localGitFactory = new MockLocalGitFactory()
        let system = new BuildSystemImpl(redisFactory, mockTime, jobExecutor, repositoryAccessFactory, repositoryFactory, activeRepositories, publisherManager, scannerManager, localGitFactory, { concurrency: 1 })
        return [system, mockTime, jobExecutor]
    }

    beforeEach(async () => {
        await redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        await redisFactory.shutdown()
    })

    it("Add Update", async () => {
        let sha = Refs.ShaRef.create(_.repeat("1", 40))
        let source = new RepositorySource(
            "csp-gerrit",
            "playground/cynosure/cynosure_a"
        )
        let updateId = "Update-1"
        let update = <Update>{
            id: updateId,
            labels: ["label1"],
            sha: sha,
            source: source,
            target: "master",
            title: "Some updated"
        }
        let ref = JobRef.create(JobRefType.UPDATE, updateId)
        const job = new JobExecutor.Key(source, ref, sha)
        let [buildSystem, time, jobExecutor] = createSystem()
        await buildSystem.onUpdate(update)
        expect(await buildSystem.getStatus(job)).toBe(QueueStatus.STARTING)
        await TestWait.waitPromise(500)
        expect(jobExecutor.checkExists(job)).toBe(true)
        await jobExecutor.signal(MockAction.STARTED, job)
        expect(await buildSystem.getStatus(job)).toBe(QueueStatus.STARTED)
        await jobExecutor.signal(MockAction.FAILURE, job)
        expect(await buildSystem.getStatus(job)).toBeNull() //Removed
    })

    it("Add Update after existing with different sha. Ensure aborting until next starts", async () => {
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
        let sha2 = Refs.ShaRef.create(_.repeat("2", 40))
        let update2 = <Update>{
            id: updateId,
            labels: ["label1"],
            sha: sha2,
            source: source,
            target: "master",
            title: "Some updated"
        }

        let ref = JobRef.create(JobRefType.UPDATE, updateId)

        const job1 = new JobExecutor.Key(source, ref, sha1)
        const job2 = new JobExecutor.Key(source, ref, sha2)

        let [buildSystem, time, jobExecutor] = createSystem()
        await buildSystem.onUpdate(update1)
        expect(await buildSystem.getStatus(job1)).toBe(QueueStatus.STARTING)
        await TestWait.waitPromise(500)
        expect(jobExecutor.checkExists(job1)).toBe(true)


        await buildSystem.onUpdate(update2)
        expect(await buildSystem.getStatus(job2)).toBe(QueueStatus.STARTING)

        expect(await buildSystem.getStatus(job1)).toBeNull()
        expect(await buildSystem.getStatus(job2)).toBe(QueueStatus.STARTING)
        await jobExecutor.signal(MockAction.STARTED, job2)
        expect(await buildSystem.getStatus(job2)).toBe(QueueStatus.STARTED)
        await jobExecutor.signal(MockAction.FAILURE, job2)
        expect(await buildSystem.getStatus(job2)).toBeNull()
    })
})

enum MockAction {
    STARTED = "start",
    SUCCEESS = "success",
    FAILURE = "failure",
    ERROR = "error"
}

class MockActiveRepositories implements ActiveRepositories {
    addActiveRepositories(...sources: RepositorySource[]): Promise<void> {
        return Promise.resolve()
    }
    removeActiveRepositories(...sources: RepositorySource[]): Promise<void> {
        return Promise.resolve()
    }
    activeRepositories(): Promise<RepositorySource[]> {
        throw new Error('Method not implemented.')
    }
    isActive(source: RepositorySource): Promise<boolean> {
        return Promise.resolve(true)
    }

}


class MockJobExecutor implements JobExecutor.Executor {
    log: JobExecutor.Key[] = []
    private listener: JobExecutor.Listener | null = null

    startJob(job: JobExecutor.Key): Promise<void> {
        console.log(`Got start job: ${job}`)
        this.log.push(job)
        return Promise.resolve()
    }
    abortJob(job: JobExecutor.Key): Promise<void> {
        console.log(`Got abort job: ${job}`)
        this.log.push(job)
        return Promise.resolve()
    }

    private findIndex(key: JobExecutor.Key): number {
        return _.findIndex(this.log, (entry: JobExecutor.Key) => {
            return key.equals(entry)
        })
    }

    checkExists(key: JobExecutor.Key): boolean {
        return this.findIndex(key) >= 0
    }

    signal(trigger: MockAction, key: JobExecutor.Key): void {
        let index = this.findIndex(key)
        if (index >= 0) {
            let key = this.log[index]
            this.log = this.log.splice(index, 1)
            if (trigger === MockAction.STARTED) {
                ensureDefined(this.listener).onJobStarted(key)
            } else if (trigger === MockAction.SUCCEESS) {
                ensureDefined(this.listener).onJobSuccess(key)
            } else if (trigger === MockAction.FAILURE) {
                ensureDefined(this.listener).onJobFailure(key)
            } else if (trigger === MockAction.ERROR) {
                ensureDefined(this.listener).onJobError(key)
            } else {
                throw new Error(`Unknown action ${trigger}`)
            }
        } else {
            throw new Error(`${key} doesn't exist!`)
        }
    }

    setListener(listener: JobExecutor.Listener): void {
        this.listener = listener
    }
}