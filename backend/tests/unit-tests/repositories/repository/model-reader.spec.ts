import { describe, expect, it } from '@jest/globals'
import { RepositoryModel } from '../../../../src/domain-model/repository-model/repository-model'
import { Version } from '../../../../src/domain-model/version'
import { RepositoryModelReaderImpl } from '../../../../src/repositories/repository/repository-model-reader'

import { TestUtils } from '../../../helpers/test-utils'

describe("Model reader", () => {

    it("Test only main", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                0,
                new RepositoryModel.MainBranch("master", TestUtils.sha("0").sha),
                [],
                undefined
            ),
            []
        )
        const reader = new RepositoryModelReaderImpl(model)
        const readSha0 = reader.resolveReadSha(0)
        expect(readSha0?.sha).toBe(TestUtils.sha("0").sha)
    })

    it("Test only main + 1 major without branch", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                1,
                new RepositoryModel.MainBranch("master", TestUtils.sha("0").sha),
                [],
                TestUtils.sha("1").sha
            ),
            [
                new RepositoryModel.MajorContainer(
                    0,
                    [],
                    undefined,
                    undefined
                )
            ]
        )
        const reader = new RepositoryModelReaderImpl(model)
        const readSha1 = reader.resolveReadSha(1)
        expect(readSha1?.sha).toBe(TestUtils.sha("0").sha)
        const readSha0 = reader.resolveReadSha(0)
        expect(readSha0?.sha).toBe(TestUtils.sha("1").sha)
    })

    it("Test top with only main + 1 major", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                1,
                new RepositoryModel.MainBranch("master", TestUtils.sha("0").sha),
                [],
                TestUtils.sha("1").sha
            ),
            [
                new RepositoryModel.MajorContainer(
                    0,
                    [],
                    undefined,
                    undefined
                )
            ]
        )
        const reader = new RepositoryModelReaderImpl(model)
        const top0 = reader.top(0)
        expect(top0.length).toBe(0)

        const top1 = reader.top(1)
        expect(top1.length).toBe(1)
        expect(top1[0].major).toBe(1)

        const top2 = reader.top(2)
        expect(top2.length).toBe(2)
        expect(top2[0].major).toBe(1)
        expect(top2[1].major).toBe(0)

        const top3 = reader.top(3)
        expect(top3.length).toBe(2)
        expect(top3[0].major).toBe(1)
        expect(top3[1].major).toBe(0)

    })

    it("Find next major", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                2,
                new RepositoryModel.MainBranch("master", TestUtils.sha("0").sha),
                [],
                TestUtils.sha("1").sha
            ),
            [
                new RepositoryModel.MajorContainer(
                    1,
                    [],
                    undefined,
                    undefined
                ),
                new RepositoryModel.MajorContainer(
                    0,
                    [],
                    undefined,
                    undefined
                )
            ],

        )
        const reader = new RepositoryModelReaderImpl(model)
        const afterMain = reader.findNextMajor(2)
        expect(afterMain).toBeUndefined()
        const after1 = reader.findNextMajor(1)
        expect(after1?.major).toBe(2)
        const after0 = reader.findNextMajor(0)
        expect(after0?.major).toBe(1)


    })

    it("Test write branches main + 2 majors with/without branch", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                2,
                new RepositoryModel.MainBranch("master", TestUtils.sha("0").sha),
                [],
                TestUtils.sha("1").sha
            ),
            [
                new RepositoryModel.MajorContainer(
                    1,
                    [],
                    TestUtils.sha("3").sha,
                    undefined
                ),
                new RepositoryModel.MajorContainer(
                    0,
                    [],
                    undefined,
                    TestUtils.sha("4").sha
                )
            ]
        )
        const reader = new RepositoryModelReaderImpl(model)

        const major2Branch = reader.resolveWriteBranch(2)
        expect(major2Branch).toBeDefined()
        expect(major2Branch?.branch.name).toBe("master")
        expect(major2Branch?.sha.sha).toBe(TestUtils.sha("0").sha)

        const major1Branch = reader.resolveWriteBranch(1)
        expect(major1Branch).toBeDefined()
        expect(major1Branch?.branch.name).toBe("patch-1")
        expect(major1Branch?.exists).toBe(false)
        expect(major1Branch?.sha.sha).toBe(TestUtils.sha("1").sha)

        const major0Branch = reader.resolveWriteBranch(0)
        expect(major0Branch).toBeDefined()
        expect(major0Branch?.branch.name).toBe("patch-0")
        expect(major0Branch?.exists).toBe(true)
        expect(major0Branch?.sha.sha).toBe(TestUtils.sha("4").sha)
    })

    it("getVersionSha", async () => {
        const model = new RepositoryModel.Root(
            new RepositoryModel.MainContainer(
                2,
                new RepositoryModel.MainBranch("master", TestUtils.sha("2").sha),
                [
                    new RepositoryModel.MinorContainer(
                        0,
                        [
                            new RepositoryModel.Release(0, TestUtils.sha("200").sha),
                            new RepositoryModel.Release(1, TestUtils.sha("201").sha)
                        ],
                        undefined,
                    )
                ],
                TestUtils.sha("20").sha
            ),
            [new RepositoryModel.MajorContainer(
                1,
                [
                    new RepositoryModel.MinorContainer(
                        1,
                        [new RepositoryModel.Release(0, TestUtils.sha("110").sha),
                        new RepositoryModel.Release(1, TestUtils.sha("111").sha)
                        ],
                        undefined
                    ),

                ],
                TestUtils.sha("10").sha,
                undefined
            ),
            ]
        )
        const reader = new RepositoryModelReaderImpl(model)
        expect(reader.versionSha(Version.create("2.0.0"))?.sha).toBe(TestUtils.sha("200").sha)
        expect(reader.versionSha(Version.create("2.0.1"))?.sha).toBe(TestUtils.sha("201").sha)
        expect(reader.versionSha(Version.create("1.1.0"))?.sha).toBe(TestUtils.sha("110").sha)
        expect(reader.versionSha(Version.create("1.1.1"))?.sha).toBe(TestUtils.sha("111").sha)
    })
})
