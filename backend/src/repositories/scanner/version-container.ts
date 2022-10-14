import assert from "assert";
import { Expose, Type } from "class-transformer";
import _ from 'lodash';
import { Codec } from "../../domain-model/system-config/codec";
import { Version } from "../../domain-model/version";
export class VersionContainer {
    private constructor(private model: ModelComposite) { }

    static fromVersions(versions: Version[]) {
        const model = new ModelComposite()
        versions.forEach(v => {
            model.add(v.segments)
        })
        return new VersionContainer(model)
    }

    static deserialize(serialized: string): VersionContainer {
        return new VersionContainer(Codec.toInstance(serialized, ModelComposite))
    }

    size(): number {
        return this.model.size()
    }

    serialize(): string {
        return Codec.toJson(this.model)
    }

    getHighest(major: number | undefined): Version | undefined {
        return this.model.getHighestVersion(major)
    }
}



class ModelComposite {
    @Expose()
    @Type(() => SegmentHolder)
    private branches: SegmentHolder[]

    @Expose()
    @Type(() => Number)
    private releases: number[]

    constructor() {
        this.branches = []
        this.releases = []
    }

    size(): number {
        const lowerSize = this.branches.reduce((acc, next) => {
            return acc + next.model.size()
        }, 0)
        return this.releases.length + lowerSize
    }

    getHighestVersion(maxMajor: number | undefined): Version | undefined {
        const segments = this.getHighest(maxMajor)
        if (segments && segments.length) {
            return Version.fromSegments(segments)
        }
    }
    private getHighest(max: number | undefined): number[] {
        const highestSegment = _.maxBy(max === undefined ? this.branches : this.branches.filter(s => { return s.index <= max }), s => { return s.index })
        if (highestSegment) {
            return [highestSegment.index, highestSegment.model.getHighest(undefined)].flat()
        } else {
            return this.releases.length ? [<number>_.max(this.releases)] : []
        }
    }

    add(parts: number[]): void {
        if (parts.length === 1) {
            const part = parts[0]
            if (this.releases.findIndex(r => { return r === part }) === -1) {
                this.releases.push(part)
            }
        } else if (parts.length) {
            const [head, ...rest] = parts
            let holder = this.branches.find(s => { return s.index === head })
            if (holder) {
                holder.model.add(rest)
            } else {
                holder = new SegmentHolder(head, new ModelComposite())
                holder.model.add(rest)
                this.branches.push(holder)
            }
        }
    }
}

class SegmentHolder {
    @Expose()
    readonly index: number

    @Expose()
    @Type(() => ModelComposite)
    readonly model: ModelComposite

    constructor(index: number, model: ModelComposite) {
        this.index = index
        this.model = model
    }


}