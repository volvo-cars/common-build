import { Version } from "../../domain-model/version";
import _ from 'lodash'
export class VersionContainer {
    private model: ModelComposite
    constructor(versions: Version[]) {
        const model = new ModelComposite()
        versions.forEach(v => {
            model.add(v.segments)
        })
        this.model = model
    }

    getHighest(major: number | undefined): Version | undefined {
        return this.model.getHighestByMajor(major)
    }
}

class ModelComposite {
    private nextBySegment: Map<number, ModelComposite> = new Map()
    private releases: Set<number> = new Set()

    constructor() { }

    getHighestByMajor(major: number | undefined): Version | undefined {
        const nexts = Array.from(this.nextBySegment.keys())
        const compliantNexts = major === undefined ? nexts : nexts.filter(m => {
            return (m <= major)
        })
        const highestMajor = _.max(compliantNexts)
        if (highestMajor !== undefined) {
            return this.nextBySegment.get(highestMajor)?.getHighest([highestMajor])
        } else {
            return undefined
        }
    }
    getHighest(matched: number[]): Version | undefined {
        const nexts = Array.from(this.nextBySegment.keys())
        const releases = Array.from(this.releases.keys())
        const highestNext = _.max(nexts)
        const highestRelease = _.max(releases)
        if (highestNext !== undefined) {
            if (highestRelease && highestRelease > highestNext) {
                return Version.fromSegments(_.concat(matched, highestRelease))
            }
            return this.nextBySegment.get(highestNext)?.getHighest(_.concat(matched, highestNext))
        } else if (highestRelease !== undefined) {
            return Version.fromSegments(_.concat(matched, highestRelease))
        } else {
            return undefined
        }
    }

    add(segments: number[]): void {
        if (segments.length) {
            if (segments.length === 1) {
                this.releases.add(segments[0])
            } else {
                const head = segments[0]
                const rest = _.tail(segments)
                let parent = this.nextBySegment.get(head)
                if (!parent) {
                    parent = new ModelComposite()
                    this.nextBySegment.set(head, parent)
                }
                parent.add(rest)
            }
        }
    }
}