import _ from 'lodash'
import { Refs } from '../../domain-model/refs'
import { RepositoryModel } from '../../domain-model/repository-model/repository-model'
import { Version } from '../../domain-model/version'
import { NormalizedModel, NormalizedModelUtil } from './normalized-model'
import { MajorRead, VersionType, WriteBranch } from './repository'


export interface RepositoryModelReader {
    readonly model: RepositoryModel.Root
    nextVersion(branch: Refs.BranchRef, versionType: VersionType): Version
    findMajor(major: number): RepositoryModel.TopContainer | undefined
    findNextMajor(major: number): RepositoryModel.TopContainer | undefined
    resolveReadShas(majorCount: number): MajorRead[]
    resolveWriteBranch(major: number): WriteBranch | undefined
    highestVersion(maxMajor: number | undefined): Version | undefined
    versionSha(version: Version): Refs.ShaRef | undefined
    mainSha(): Refs.ShaRef
    mainMajor(): number
    findBranch(major: number, minor: number | undefined): Refs.Branch | undefined
}

export class RepositoryModelReaderImpl implements RepositoryModelReader {
    constructor(public readonly model: RepositoryModel.Root) { }


    findMajor(major: number): RepositoryModel.TopContainer | undefined {
        if (major === this.model.main.major) {
            return this.model.main
        } else {
            return this.model.majors.find(m => { return m.major === major })
        }
    }
    findNextMajor(major: number): RepositoryModel.TopContainer | undefined {
        const allMajors = _.concat(this.model.main, <RepositoryModel.TopContainer[]>this.model.majors)
        const majorIndex = allMajors.findIndex(m => { return m.major === major })
        console.log(major)
        console.log(majorIndex)
        console.dir(allMajors, { depth: null })
        if (majorIndex >= 1) {
            return allMajors[majorIndex - 1]
        }
    }


    findBranch(major: number, minor: number | undefined): Refs.Branch | undefined {
        const findMinorBranch = (minorContainers: RepositoryModel.MinorContainer[]) => {
            const minorContainer = minorContainers.find(m => { return m.minor === minor })
            if (minorContainer?.branch) {
                return Refs.Branch.create(`refs/heads/patch-${major}.${minor}`, minorContainer.branch)
            }
            return undefined
        }

        if (major === this.model.main.major) {
            if (minor !== undefined) {
                return findMinorBranch(this.model.main.minors)
            }
            return Refs.Branch.create(`refs/heads/${this.model.main.main.name}`, this.model.main.main.sha)
        } else {
            const foundMajor = this.model.majors.find(m => { return m.major === major })
            if (foundMajor) {
                if (minor !== undefined) {
                    return findMinorBranch(foundMajor.minors)
                }
                if (foundMajor.branch !== undefined) {
                    return Refs.Branch.create(`refs/heads/patch-${major}`, foundMajor.branch)
                }
            }
        }
    }

    nextVersion(branch: Refs.BranchRef, versionType: VersionType): Version {
        const normalizedRef = NormalizedModelUtil.normalize(branch)
        if (normalizedRef) {
            if (normalizedRef.type === NormalizedModel.Type.MAIN_BRANCH) {
                return Version.fromSegments(getNextRelease(this.model.main, versionType))
            } else if (normalizedRef.type === NormalizedModel.Type.PATCH_BRANCH) {
                const patchBranchRef = <NormalizedModel.PatchBranchRef>normalizedRef
                const patchBranchMajor = patchBranchRef.segments[0]
                const majorContainer = _.find(this.model.majors, (container: RepositoryModel.MajorContainer) => {
                    return container.major === patchBranchMajor
                })
                if (majorContainer) {
                    return Version.fromSegments(getNextRelease(majorContainer, versionType))
                } else {
                    throw new Error(`Could not release from ${branch.name}. Unknown major: ${patchBranchMajor}.`)
                }
            } else {
                throw new Error(`Unknown branch type: ${normalizedRef.type}`)
            }
        } else {
            throw new Error(`Not a supported ref: ${branch.name}`)
        }
    }



    resolveReadShas(majorCount: number): MajorRead[] {
        return getReadShas(this.model, majorCount).flatMap(majorRead => { return majorRead ? [majorRead] : [] })
    }
    resolveWriteBranch(major: number): WriteBranch | undefined {
        return getWriteBranch(this.model, major)
    }
    highestVersion(maxMajor: number | undefined): Version | undefined {
        return getHighestVersion(this.model, maxMajor)
    }
    versionSha(version: Version): Refs.ShaRef | undefined {
        return getVersionSha(this.model, version)
    }
    mainSha(): Refs.ShaRef {
        return Refs.ShaRef.create(this.model.main.main.sha)
    }
    mainMajor(): number {
        return this.model.main.major
    }
}

export const getNextRelease = (container: RepositoryModel.TopContainer, type: VersionType): number[] => {
    const lastMinor = _.first(container.minors)
    if (lastMinor) {
        const lastRelease = _.first(lastMinor.releases)
        if (lastRelease) {
            if (type === VersionType.MINOR) {
                return [container.major, lastMinor.minor + 1, 0]
            } else {
                return [container.major, lastMinor.minor, lastRelease.patch + 1]
            }
        } else {
            return [container.major, lastMinor.minor, 0]
        }
    } else {
        return [container.major, 0, 0]
    }
}

export const getHighestVersion = (model: RepositoryModel.Root, maxMajor: number | undefined): Version | undefined => {
    const majorLimit = maxMajor !== undefined ? maxMajor : Number.MAX_SAFE_INTEGER
    let topContainers = _.filter(_.concat(<RepositoryModel.TopContainer>model.main, model.majors), container => {
        return container.major <= majorLimit
    })
    const highestMajorWithMinorRelease = _.find(topContainers, container => {
        return container.minors.length > 0 && container.minors[0].releases.length > 0
    })
    if (highestMajorWithMinorRelease) {
        const minor = highestMajorWithMinorRelease.minors[0]
        const release = minor.releases[0]
        return Version.fromSegments([highestMajorWithMinorRelease.major, minor.minor, release.patch])
    } else {
        return undefined
    }
}

export const getReadShas = (model: RepositoryModel.Root, majorCount: number): (MajorRead | undefined)[] => {
    return _.range(0, majorCount).map(index => {
        if (index === 0) {
            return new MajorRead(
                model.main.major,
                Refs.ShaRef.create(model.main.main.sha)
            )
        } else {
            const container = _.nth(model.majors, index - 1)
            if (container) {
                if (container.branch) {
                    return new MajorRead(
                        container.major,
                        Refs.ShaRef.create(container.branch)
                    )
                } else {
                    const nextMajorIndex = index - 1
                    if (nextMajorIndex === 0) {
                        const nextContainer = model.main
                        if (nextContainer.start) {
                            return new MajorRead(
                                container.major,
                                Refs.ShaRef.create(nextContainer.start)
                            )
                        }
                    } else {
                        const nextContainer = _.nth(model.majors, nextMajorIndex - 1)
                        if (nextContainer) {
                            if (nextContainer.start) {
                                return new MajorRead(
                                    nextContainer.major,
                                    Refs.ShaRef.create(nextContainer.start)
                                )
                            }
                        } else {
                            return undefined
                        }
                    }
                }
            } else {
                return undefined
            }
        }
    })
}

export const getVersionSha = (model: RepositoryModel.Root, version: Version): Refs.ShaRef | undefined => {
    if (version.segments.length === 3) {
        const [majorVersion, minorVersion, patchVersion] = version.segments
        const major = model.main.major === majorVersion ? model.main : model.majors.find(m => { return m.major === majorVersion })
        if (major) {
            const minor = major.minors.find(m => { return m.minor === minorVersion })
            if (minor) {
                const patch = minor.releases.find(r => { return r.patch === patchVersion })
                if (patch) {
                    return Refs.ShaRef.create(patch.sha)
                }
            }
        }
    }
    return undefined
}



export const getWriteBranch = (model: RepositoryModel.Root, major: number): WriteBranch | undefined => {
    if (model.main.major === major) {
        return new WriteBranch(
            Refs.ShaRef.create(model.main.main.sha),
            Refs.BranchRef.create(`refs/heads/${model.main.main.name}`),
            true
        )
    } else {
        const majorContainerIndex = _.findIndex(model.majors, (container => {
            return container.major === major
        }))
        if (majorContainerIndex >= 0) {
            const majorContainer = model.majors[majorContainerIndex]
            const branchRef = Refs.BranchRef.create(`refs/heads/patch-${major}`)
            if (majorContainer.branch) {
                return {
                    sha: Refs.ShaRef.create(majorContainer.branch),
                    branch: branchRef,
                    exists: true
                }
            } else {
                if (majorContainerIndex === 0) {
                    if (model.main.start) {
                        return {
                            sha: Refs.ShaRef.create(model.main.start),
                            branch: branchRef,
                            exists: false
                        }
                    }
                    return undefined
                } else {
                    const nextContainer = _.nth(model.majors, majorContainerIndex - 1)
                    if (nextContainer && nextContainer.start) {
                        return {
                            sha: Refs.ShaRef.create(nextContainer.start),
                            branch: branchRef,
                            exists: false
                        }
                    }
                    return undefined
                }
            }
        } else {
            return undefined
        }
    }
}

