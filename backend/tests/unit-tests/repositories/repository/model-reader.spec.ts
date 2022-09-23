import { describe, expect, it } from '@jest/globals'
import { RepositoryModel } from '../../../../src/domain-model/repository-model/repository-model'
import { Version } from '../../../../src/domain-model/version'
import { getReadShas, getVersionSha, getWriteBranch, RepositoryModelReaderImpl } from '../../../../src/repositories/repository/repository-model-reader'

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
        const majorReads = getReadShas(model, 1)
        expect(majorReads.length).toBe(1)
        expect(majorReads[0]?.major).toBe(0)
        expect(majorReads[0]?.sha?.sha).toBe(TestUtils.sha("0").sha)
        const majorReads2 = getReadShas(model, 2)
        expect(majorReads2.length).toBe(2)
        expect(majorReads2[0]?.major).toBe(0)
        expect(majorReads2[0]?.sha?.sha).toBe(TestUtils.sha("0").sha)
        expect(majorReads2[1]).toBeUndefined()
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
        const majorReads = getReadShas(model, 2)
        expect(majorReads.length).toBe(2)
        expect(majorReads[0]?.major).toBe(1)
        expect(majorReads[0]?.sha?.sha).toBe(TestUtils.sha("0").sha)
        expect(majorReads[1]?.major).toBe(0)
        expect(majorReads[1]?.sha?.sha).toBe(TestUtils.sha("1").sha)
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


        const major2Branch = getWriteBranch(model, 2)
        expect(major2Branch).toBeDefined()
        expect(major2Branch?.branch.name).toBe("master")
        expect(major2Branch?.sha.sha).toBe(TestUtils.sha("0").sha)

        const major1Branch = getWriteBranch(model, 1)
        expect(major1Branch).toBeDefined()
        expect(major1Branch?.branch.name).toBe("patch-1")
        expect(major1Branch?.exists).toBe(false)
        expect(major1Branch?.sha.sha).toBe(TestUtils.sha("1").sha)

        const major0Branch = getWriteBranch(model, 0)
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
        expect(getVersionSha(model, Version.create("2.0.0"))?.sha).toBe(TestUtils.sha("200").sha)
        expect(getVersionSha(model, Version.create("2.0.1"))?.sha).toBe(TestUtils.sha("201").sha)
        expect(getVersionSha(model, Version.create("1.1.0"))?.sha).toBe(TestUtils.sha("110").sha)
        expect(getVersionSha(model, Version.create("1.1.1"))?.sha).toBe(TestUtils.sha("111").sha)
    })
})
