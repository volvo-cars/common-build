import { toString } from "lodash"
import { SourceCache } from "../system/source-cache"

export namespace Refs {


    export interface Ref {
        name: string
        toString(): string
        get originRef(): string
        equals(other: Ref): boolean

    }

    export interface EntityRef extends Ref {
        get refSpec(): SourceCache.RefSpec
        get remoteRef(): string
    }

    export class BranchRef implements EntityRef {

        constructor(public readonly name: string) { }

        static create(name: string): BranchRef {
            return new BranchRef(name)
        }

        get originRef(): string {
            return `refs/remotes/origin/${this.name}`
        }

        get remoteRef(): string {
            return `refs/heads/${this.name}`
        }


        equals(other: Ref): boolean {
            if (other instanceof BranchRef) {
                return other.name === this.name
            }
            return false
        }

        get refSpec(): SourceCache.RefSpec {
            return new SourceCache.RefSpec(`+refs/heads/${this.name}:refs/remotes/origin/${this.name}`)
        }

        toString(): string {
            return `branch-ref: ${this.name}`
        }
    }

    export class TagRef implements EntityRef {
        constructor(public readonly name: string) { }
        static create(name: string): TagRef {
            return new TagRef(name)
        }
        get originRef(): string {
            return `refs/tags/${this.name}`
        }
        get remoteRef(): string {
            return `refs/tags/${this.name}`
        }
        equals(other: Ref): boolean {
            if (other instanceof TagRef) {
                return other.name === this.name
            }
            return false
        }
        get refSpec(): SourceCache.RefSpec {
            return new SourceCache.RefSpec(`+refs/tags/${this.name}:refs/tags/${this.name}`)
        }

        toString(): string {
            return `tag-ref: ${this.name}`
        }
    }

    export class MetaConfigBranchRef extends BranchRef {
        constructor() {
            super("meta/config")
        }

        public static INSTANCE = new MetaConfigBranchRef()

        static parse(ref: string): MetaConfigBranchRef | undefined {
            return ref === "refs/meta/config" ? MetaConfigBranchRef.INSTANCE : undefined
        }

        override get remoteRef(): string {
            return `refs/${this.name}`
        }

        override get refSpec(): SourceCache.RefSpec {
            return new SourceCache.RefSpec(`+refs/${this.name}:refs/remotes/origin/${this.name}`)
        }
        toString(): string {
            return `meta-config-branch-ref: meta/config`
        }
    }


    export class ShaRef implements Ref {
        static regExp = /^[0-9a-f]{40}$/i
        public readonly name: string
        private constructor(public readonly sha: string) {
            this.name = sha
        }
        static create(sha: string): ShaRef {
            if (this.regExp.test(sha)) {
                return new ShaRef(sha)
            } else {
                throw new Error(`Bad sha ref: ${sha}`)
            }
        }
        get originRef(): string {
            return this.name
        }

        equals(other: Ref): boolean {
            if (other instanceof ShaRef) {
                return other.name === this.name
            }
            return false
        }

        toString(): string {
            return `sha:${this.sha}`
        }
    }

    export interface Entity {
        readonly ref: EntityRef
        readonly sha: ShaRef
    }

    export class Branch implements Entity {
        constructor(public readonly ref: BranchRef, public readonly sha: ShaRef) { }

        static create(name: string, sha: string): Branch {
            const shaRef = ShaRef.create(sha)
            if (shaRef instanceof ShaRef) {
                return Branch.createWithSha(name, <ShaRef>shaRef)
            }
            throw new Error(`Bad branch sha-ref: ${sha}`)
        }
        withSha(sha: string): Branch {
            return new Branch(this.ref, ShaRef.create(sha))
        }
        static createWithSha(name: string, sha: ShaRef): Branch {
            const branchRef = new BranchRef(name)
            return new Branch(branchRef, sha)
        }
        toString(): string {
            return `Branch ${this.ref.name} -> ${this.sha.sha}`
        }

    }

    export class Tag implements Entity {
        constructor(public readonly ref: TagRef, public readonly sha: ShaRef) { }
        static create(ref: string, sha: string): Tag {
            const shaRef = ShaRef.create(sha)
            return Tag.createWithSha(ref, shaRef)
        }
        static createWithSha(name: string, sha: ShaRef): Branch {
            const tagRef = new TagRef(name)
            return new Branch(tagRef, sha)
        }
        toString(): string {
            return `Tag ${this.ref.name} -> ${this.sha.sha}`
        }
    }

    export const createFromRemoteRef = (ref: string): EntityRef => {
        const parts = ref.split('/')
        const [r1, r2, r3] = parts
        if (r1 === "refs") {
            if (r2 === "tags") {
                return new TagRef(parts.splice(2).join("/"))
            } else if (r2 === "remotes") {
                const nameParts = parts.splice(3)
                return new BranchRef(nameParts.join("/"))
            } else if (r2 === "heads") {
                return new BranchRef(parts.splice(2).join("/"))
            } else if (r2 === "meta" && r3 === "config") {
                return MetaConfigBranchRef.INSTANCE
            }
        }
        throw new Error(`Could not decode ${ref} to EntityRef`)
    }

    export const tryCreateFromRemoteRef = (ref: string): EntityRef | undefined => {
        try {
            return createFromRemoteRef(ref)
        } catch (e) {
            return undefined
        }
    }
}