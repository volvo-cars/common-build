import { afterAll, beforeEach, describe, it } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../../src/domain-model/refs'
import { RepositoryPath, RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { createForTest } from '../../../../src/redis/redis-factory'
import { RawModelRepository, RepositoryStateProvider } from '../../../../src/repositories/repository/raw-model-repository'
import { TestUtils } from '../../../helpers/test-utils'
describe("Testing raw-model repository", () => {
    let redisFactory = createForTest()

    beforeEach(async () => {
        return redisFactory.get().then(client => { return client.flushall() })
    })
    afterAll(async () => {
        return redisFactory.shutdown()
    })


    it("Test main container", async () => {
        const source = new RepositorySource(
            "hello",
            "dummy"
        )
        const branches = [
            Refs.Branch.createWithSha("refs/heads/master", TestUtils.sha("0000"))
        ]
        const tags = [
            Refs.Tag.createWithSha("refs/tags/v1.0.0", TestUtils.sha("100")),
            Refs.Tag.createWithSha("refs/tags/v1.1.0", TestUtils.sha("110")),
            Refs.Tag.createWithSha("refs/tags/v1.1.1", TestUtils.sha("111")),
            Refs.Tag.createWithSha("refs/tags/v1.2.0", TestUtils.sha("120")),
            Refs.Tag.createWithSha("refs/tags/major-1", TestUtils.sha("abc"))
        ]
        const stateProvider = new MockRepositoryStateProvider(branches, tags)
        const rawRepository = new RawModelRepository(redisFactory)

        const model = await rawRepository.getModel(source, stateProvider)
        expect(model.main.main.name).toBe("master")
        expect(model.main.main.sha).toBe(TestUtils.sha("0000").sha)
        expect(model.main.minors.length).toBe(3)
        expect(model.main.start).toBe(TestUtils.sha("abc").sha)

        expect(model.main.minors[0].minor).toBe(2)
        expect(model.main.minors[0].releases.length).toBe(1)
        expect(model.main.minors[0].releases[0].patch).toBe(0)
        expect(model.main.minors[0].releases[0].sha).toBe(TestUtils.sha("120").sha)

        expect(model.main.minors[1].minor).toBe(1)
        expect(model.main.minors[1].releases.length).toBe(2)
        expect(model.main.minors[1].releases[0].patch).toBe(1)
        expect(model.main.minors[1].releases[0].sha).toBe(TestUtils.sha("111").sha)
        expect(model.main.minors[1].releases[1].patch).toBe(0)
        expect(model.main.minors[1].releases[1].sha).toBe(TestUtils.sha("110").sha)

        expect(model.main.minors[2].minor).toBe(0)
        expect(model.main.minors[2].releases.length).toBe(1)
        expect(model.main.minors[2].releases[0].patch).toBe(0)
        expect(model.main.minors[2].releases[0].sha).toBe(TestUtils.sha("100").sha)

        console.log(JSON.stringify(model, null, 2))

    })

    it("Test historic containers without + without branch", async () => {
        const source = new RepositorySource(
            "hello",
            "dummy"
        )
        const branches = [
            Refs.Branch.createWithSha("refs/heads/master", TestUtils.sha("0")),
            Refs.Branch.createWithSha("refs/heads/patch-1", TestUtils.sha("b1")),
        ]
        const tags = [
            Refs.Tag.createWithSha("refs/tags/v0.0.0", TestUtils.sha("000")),
            Refs.Tag.createWithSha("refs/tags/v0.1.0", TestUtils.sha("010")),
            Refs.Tag.createWithSha("refs/tags/major-1", TestUtils.sha("a1")),
            Refs.Tag.createWithSha("refs/tags/v1.0.0", TestUtils.sha("100")),
            Refs.Tag.createWithSha("refs/tags/v1.1.0", TestUtils.sha("110")),
            Refs.Tag.createWithSha("refs/tags/major-2", TestUtils.sha("a2")),
        ]

        const stateProvider = new MockRepositoryStateProvider(branches, tags)
        const rawRepository = new RawModelRepository(redisFactory)

        const model = await rawRepository.getModel(source, stateProvider)

        expect(model.main.major).toBe(2)
        expect(model.majors.length).toBe(2)
        const major1 = model.majors[0]
        expect(major1.major).toBe(1)
        expect(major1.start).toBe(TestUtils.sha("a1").sha)
        expect(major1.branch).toBe(TestUtils.sha("b1").sha)

        console.log(JSON.stringify(model, null, 2))

    })
})

class MockRepositoryStateProvider implements RepositoryStateProvider {
    private access: boolean = true
    constructor(private branches: Refs.Branch[], private tags: Refs.Tag[]) { }
    getState(path: RepositoryPath): Promise<(Refs.Branch | Refs.Tag)[]> {
        return Promise.resolve(_.concat(this.branches, this.tags))
    }
}