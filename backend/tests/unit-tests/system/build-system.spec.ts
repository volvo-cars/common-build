import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../src/domain-model/refs'
import { RepositorySource } from '../../../src/domain-model/repository-model/repository-source'
import { BuildConfig } from '../../../src/domain-model/system-config/build-config'
import { createLogger, loggerName } from '../../../src/logging/logging-factory'
import { createForTest } from "../../../src/redis/redis-factory"
import { RepositoryFactoryImpl } from '../../../src/repositories/repository/repository-factory'
import { BuildSystem, BuildSystemImpl, Update } from "../../../src/system/build-system"
import { JobExecutor, JobExecutorListener } from "../../../src/system/job-executor/job-executor"
import { JobRef, JobRefType } from "../../../src/system/job-executor/job-ref"
import { ActiveRepositories } from '../../../src/system/queue/active-repositories'
import { QueueStatus } from "../../../src/system/queue/queue"
import { ensureDefined } from "../../../src/utils/ensures"
import { MockLocalGitFactory } from "../../helpers/mock-local-git-factory"
import { MockPublisherManager } from '../../helpers/mock-publisher-manager'
import { MockRepositoryAccessFactory } from '../../helpers/mock-repository-access-factory'
import { MockScannerManager } from '../../helpers/mock-scanner-manager'
import { MockIncrementTime } from "../../helpers/mock-time"

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

        let [buildSystem, time, jobExecutor] = createSystem()
        await buildSystem.onUpdate(update)
        expect(await buildSystem.getStatus(source, ref, sha)).toBe(QueueStatus.STARTING)
        expect(jobExecutor.checkExists(source, ref, sha)).toBe(true)
        await jobExecutor.signal(MockAction.STARTED, source, ref, sha)
        expect(await buildSystem.getStatus(source, ref, sha)).toBe(QueueStatus.STARTED)
        await jobExecutor.signal(MockAction.FAILURE, source, ref, sha)
        expect(await buildSystem.getStatus(source, ref, sha)).toBeNull() //Removed
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

        let [buildSystem, time, jobExecutor] = createSystem()
        await buildSystem.onUpdate(update1)
        expect(await buildSystem.getStatus(source, ref, sha1)).toBe(QueueStatus.STARTING)
        expect(jobExecutor.checkExists(source, ref, sha1)).toBe(true)


        await buildSystem.onUpdate(update2)
        expect(await buildSystem.getStatus(source, ref, sha2)).toBe(QueueStatus.STARTING)

        expect(await buildSystem.getStatus(source, ref, sha1)).toBeNull()
        expect(await buildSystem.getStatus(source, ref, sha2)).toBe(QueueStatus.STARTING)
        await jobExecutor.signal(MockAction.STARTED, source, ref, sha2)
        expect(await buildSystem.getStatus(source, ref, sha2)).toBe(QueueStatus.STARTED)
        await jobExecutor.signal(MockAction.FAILURE, source, ref, sha2)
        expect(await buildSystem.getStatus(source, ref, sha2)).toBeNull()
    })
})

enum MockAction {
    STARTED = "start",
    SUCCEESS = "success",
    FAILURE = "failure",
    ERROR = "error"
}

class MockJobExecutorState {
    constructor(public source: RepositorySource, public ref: JobRef, public sha: Refs.ShaRef) { }

    equals(other: MockJobExecutorState): boolean {
        return this.source.id === other.source.id && this.source.path === other.source.path &&
            this.ref.type === other.ref.type && this.ref.ref === other.ref.ref &&
            this.sha.sha === other.sha.sha
    }

    toString(): string {
        return `${this.source.id}/${this.source.path}[${this.sha}]`
    }

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


class MockJobExecutor implements JobExecutor {
    log: MockJobExecutorState[] = []
    private listener: JobExecutorListener | null = null

    startJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        let entry = new MockJobExecutorState(source, ref, sha)
        console.log(`Got start job: ${entry.toString()}`)
        this.log.push(entry)
        return Promise.resolve()
    }
    abortJob(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): Promise<void> {
        let entry = new MockJobExecutorState(source, ref, sha)
        console.log(`Got abort job: ${entry.toString()}`)
        this.log.push(entry)
        return Promise.resolve()
    }

    private findIndex(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): number {
        let lookfor = new MockJobExecutorState(source, ref, sha)
        return _.findIndex(this.log, (entry: MockJobExecutorState) => {
            return lookfor.equals(entry)
        })
    }

    checkExists(source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): boolean {
        return this.findIndex(source, ref, sha) >= 0
    }

    signal(trigger: MockAction, source: RepositorySource, ref: JobRef, sha: Refs.ShaRef): void {
        let index = this.findIndex(source, ref, sha)
        if (index >= 0) {
            let entry = this.log[index]
            this.log = this.log.splice(index, 1)
            if (trigger === MockAction.STARTED) {
                ensureDefined(this.listener).onJobStarted(entry.source, entry.ref, entry.sha)
            } else if (trigger === MockAction.SUCCEESS) {
                ensureDefined(this.listener).onJobSuccess(entry.source, entry.ref, entry.sha)
            } else if (trigger === MockAction.FAILURE) {
                ensureDefined(this.listener).onJobFailure(entry.source, entry.ref, entry.sha)
            } else if (trigger === MockAction.ERROR) {
                ensureDefined(this.listener).onJobError(entry.source, entry.ref, entry.sha)
            } else {
                throw new Error(`Unknown action ${trigger}`)
            }
        } else {
            throw new Error(`${source}:${sha} doesn't exist!`)
        }
    }

    setListener(listener: JobExecutorListener): void {
        this.listener = listener
    }
}