import { RawModel } from "./raw-model-repository";
import _ from 'lodash'
import { RepositoryModel } from "../../domain-model/repository-model/repository-model";

export class RawDataToModelConverter {

    private constructor() { }

    static convertModel(rawModel: RawModel.Data): RepositoryModel.Root {
        const buildersByMajor: Record<number, MajorContainerBuilder> = {}
        const getOrCreateBuilder = (major: number): MajorContainerBuilder => {
            let existing = buildersByMajor[major]
            if (!existing) {
                existing = new MajorContainerBuilder(major)
                buildersByMajor[major] = existing
            }
            return existing
        }
        rawModel.majorTags.forEach(majorTag => {
            getOrCreateBuilder(majorTag.number).setStart(majorTag.sha)
        })
        rawModel.patchBranches.forEach(patchBranch => {
            const builder = getOrCreateBuilder(patchBranch.numbers[0])
            if (patchBranch.numbers.length = 1) {
                builder.setDefaultBranchSha(patchBranch.sha)
            } else if (patchBranch.numbers.length === 2) {
                builder.getMinorBuilder(patchBranch.numbers[1]).setDefaultBranchSha(patchBranch.sha)
            }
        })
        rawModel.releaseTags.forEach(releaseTag => {
            const builder = getOrCreateBuilder(releaseTag.numbers[0])
            if (releaseTag.numbers.length === 3) {
                builder.getMinorBuilder(releaseTag.numbers[1]).addRelease(releaseTag.numbers[2], releaseTag.sha)
            }
        })
        let highestBuilder = _.maxBy(Object.values(buildersByMajor), (builder => { return builder.major }))
        if (highestBuilder) {
            delete (buildersByMajor[highestBuilder.major])
            return new RepositoryModel.Root(
                highestBuilder.buildMainContainer(rawModel.main.name, rawModel.main.sha),
                _.sortBy(Object.values(buildersByMajor).map(builder => {
                    return builder.buildMajorContainer()
                }), container => { return container.major * -1 })
            )
        } else {
            return new RepositoryModel.Root(
                new RepositoryModel.MainContainer(
                    0,
                    new RepositoryModel.MainBranch(rawModel.main.name, rawModel.main.sha),
                    [],
                    undefined
                ),
                []
            )
        }
    }
}
type Sha = string
class MajorContainerBuilder {
    branchSha: Sha | undefined
    start: Sha | undefined
    private minorBuilders: Record<number, MinorContainerBuilder> = {}

    constructor(readonly major: number) { }

    setDefaultBranchSha(sha: Sha): void {
        this.branchSha = sha
    }
    setStart(sha: Sha): void {
        this.start = sha
    }
    getMinorBuilder(minor: number): MinorContainerBuilder {
        let existing = this.minorBuilders[minor]
        if (!existing) {
            existing = new MinorContainerBuilder(minor)
            this.minorBuilders[minor] = existing
        }
        return existing
    }

    private buildMinors(): RepositoryModel.MinorContainer[] {
        return _.sortBy(Object.values(this.minorBuilders).map(builder => { return builder.build() }), (container => { return container.minor * -1 }))
    }

    buildMainContainer(defaultName: string, defaultSha: Sha): RepositoryModel.MainContainer {
        return new RepositoryModel.MainContainer(
            this.major,
            new RepositoryModel.MainBranch(defaultName, defaultSha),
            this.buildMinors(),
            this.start
        )
    }
    buildMajorContainer(): RepositoryModel.MajorContainer {
        return new RepositoryModel.MajorContainer(
            this.major,
            this.buildMinors(),
            this.start,
            this.branchSha
        )
    }
}

class MinorContainerBuilder {
    branchSha: Sha | undefined
    private releases: Record<number, Sha> = {}
    constructor(readonly minor: number) { }
    setDefaultBranchSha(sha: Sha): void {
        this.branchSha = sha
    }
    addRelease(patch: number, sha: Sha): void {
        this.releases[patch] = sha
    }

    private buildReleases(): RepositoryModel.Release[] {
        Object.entries(this.releases)
        return _.sortBy(Object.entries(this.releases).map(([patch, sha]) => { return new RepositoryModel.Release(parseInt(patch), sha) }), (release => { return release.patch * -1 }))
    }


    build(): RepositoryModel.MinorContainer {
        return new RepositoryModel.MinorContainer(
            this.minor,
            this.buildReleases(),
            this.branchSha
        )
    }
}