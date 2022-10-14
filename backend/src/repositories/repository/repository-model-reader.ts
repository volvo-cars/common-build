import _ from 'lodash'
import { Refs } from '../../domain-model/refs'
import { RepositoryModel } from '../../domain-model/repository-model/repository-model'
import { Version } from '../../domain-model/version'
import { NormalizedModel, NormalizedModelUtil } from './normalized-model'
import { VersionType, WriteBranch } from './repository'


export interface RepositoryModelReader {
    readonly model: RepositoryModel.Root
    top(count: number): RepositoryModel.TopContainer[]
    nextVersion(branch: Refs.BranchRef, versionType: VersionType): Version
    findMajor(major: number): RepositoryModel.TopContainer | undefined
    findNextMajor(major: number): RepositoryModel.TopContainer | undefined
    resolveReadSha(major: number): Refs.ShaRef | undefined
    resolveWriteBranch(major: number): WriteBranch | undefined
    highestVersion(maxMajor: number | undefined): Version | undefined
    versionSha(version: Version): Refs.ShaRef | undefined
    findBranch(major: number, minor: number | undefined): Refs.Branch | undefined
    allVersions(): Version[]
}

export class RepositoryModelReaderImpl implements RepositoryModelReader {
    constructor(public readonly model: RepositoryModel.Root) { }
    allVersions(): Version[] {
        const getVersions = (major: RepositoryModel.TopContainer): Version[] => {
            return major.minors.flatMap(minor => {
                return minor.releases.map(release => {
                    return Version.fromSegments([major.major, minor.minor, release.patch])
                })
            })
        }
        return [getVersions(this.model.main), this.model.majors.map(major => { return getVersions(major) }).flat()].flat()
    }

    top(count: number): RepositoryModel.TopContainer[] {
        if (count > 0) {
            return [[this.model.main], _.take(this.model.majors, count - 1)].flat()
        } else {
            return []
        }
    }

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
        if (majorIndex >= 1) {
            return allMajors[majorIndex - 1]
        }
    }


    findBranch(major: number, minor: number | undefined): Refs.Branch | undefined {
        const findMinorBranch = (minorContainers: RepositoryModel.MinorContainer[]) => {
            const minorContainer = minorContainers.find(m => { return m.minor === minor })
            if (minorContainer?.branch) {
                return Refs.Branch.create(`patch-${major}.${minor}`, minorContainer.branch)
            }
            return undefined
        }

        if (major === this.model.main.major) {
            if (minor !== undefined) {
                return findMinorBranch(this.model.main.minors)
            }
            return Refs.Branch.create(`${this.model.main.main.name}`, this.model.main.main.sha)
        } else {
            const foundMajor = this.model.majors.find(m => { return m.major === major })
            if (foundMajor) {
                if (minor !== undefined) {
                    return findMinorBranch(foundMajor.minors)
                }
                if (foundMajor.branch !== undefined) {
                    return Refs.Branch.create(`patch-${major}`, foundMajor.branch)
                }
            }
        }
    }

    nextVersion(branch: Refs.BranchRef, versionType: VersionType): Version {
        const normalizedRef = NormalizedModelUtil.normalize(branch)
        if (normalizedRef) {
            const getNextRelease = (container: RepositoryModel.TopContainer, type: VersionType): number[] => {
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

            if (normalizedRef instanceof NormalizedModel.MainBranchRef) {
                return Version.fromSegments(getNextRelease(this.model.main, versionType))
            } else if (normalizedRef instanceof (NormalizedModel.PatchBranchRef)) {
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
                throw new Error(`Unknown branch type: ${normalizedRef.constructor.name}`)
            }
        } else {
            throw new Error(`Not a supported ref: ${branch.name}`)
        }
    }



    resolveReadSha(major: number): Refs.ShaRef | undefined {
        if (this.model.main.major === major) {
            return Refs.ShaRef.create(this.model.main.main.sha)
        } else {
            const index = this.model.majors.findIndex(m => { return m.major === major })
            if (index >= 0) {
                const container = this.model.majors[index]
                if (container) {
                    if (container.branch) {
                        return Refs.ShaRef.create(container.branch)
                    } else {
                        const nextMajorIndex = index - 1
                        if (nextMajorIndex === -1) {
                            const nextContainer = this.model.main
                            if (nextContainer.start) {
                                return Refs.ShaRef.create(nextContainer.start)
                            }
                        } else {
                            const nextContainer = this.model.majors[nextMajorIndex]
                            if (nextContainer.start) {
                                return Refs.ShaRef.create(nextContainer.start)
                            } else {
                                return undefined
                            }
                        }
                    }
                }
            } else {
                return undefined
            }
        }
    }

    resolveWriteBranch(major: number): WriteBranch | undefined {
        if (this.model.main.major === major) {
            return new WriteBranch(
                Refs.ShaRef.create(this.model.main.main.sha),
                Refs.BranchRef.create(`${this.model.main.main.name}`),
                true
            )
        } else {
            const majorContainerIndex = _.findIndex(this.model.majors, (container => {
                return container.major === major
            }))
            if (majorContainerIndex >= 0) {
                const majorContainer = this.model.majors[majorContainerIndex]
                const branchRef = Refs.BranchRef.create(`patch-${major}`)
                if (majorContainer.branch) {
                    return {
                        sha: Refs.ShaRef.create(majorContainer.branch),
                        branch: branchRef,
                        exists: true
                    }
                } else {
                    if (majorContainerIndex === 0) {
                        if (this.model.main.start) {
                            return {
                                sha: Refs.ShaRef.create(this.model.main.start),
                                branch: branchRef,
                                exists: false
                            }
                        }
                        return undefined
                    } else {
                        const nextContainer = _.nth(this.model.majors, majorContainerIndex - 1)
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
    highestVersion(maxMajor: number | undefined): Version | undefined {
        const majorLimit = maxMajor !== undefined ? maxMajor : Number.MAX_SAFE_INTEGER
        let topContainers = _.filter(_.concat(<RepositoryModel.TopContainer>this.model.main, this.model.majors), container => {
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
    versionSha(version: Version): Refs.ShaRef | undefined {
        if (version.segments.length === 3) {
            const [majorVersion, minorVersion, patchVersion] = version.segments
            const major = this.model.main.major === majorVersion ? this.model.main : this.model.majors.find(m => { return m.major === majorVersion })
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

}







