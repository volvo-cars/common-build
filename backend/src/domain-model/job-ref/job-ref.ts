import { Expose } from "class-transformer"
import { Refs } from "../refs"

export namespace JobRef {

    const delimiter = "::"

    export abstract class Ref {
        @Expose()
        readonly sha: Refs.ShaRef
        constructor(sha: Refs.ShaRef) {
            this.sha = sha
        }
        /**
         * The unique key of this ref
         */
        abstract get queueId(): Key

        abstract key(): Key

        abstract get canonicalId(): string

        abstract withSha(sha: Refs.ShaRef): Ref

        serialize(): string {
            return [this.constructor.name, this.fields()].flat().join(delimiter)
        }
        protected abstract fields(): string[]

        static deserialize = (serialized: string): Ref => {
            const parts = serialized.split(delimiter)
            const [head, ...tail] = parts
            if (head === UpdateRef.name) {
                return UpdateRef.create(tail)
            } else if (head === BranchRef.name) {
                return BranchRef.create(tail)
            } else {
                throw new Error(`Uknown job-ref-type: ${head}.`)
            }
        }

        abstract equals(other: Ref): boolean

    }

    export class UpdateRef extends Ref {

        @Expose()
        readonly updateId: string

        @Expose()
        readonly targetBranch: string

        constructor(updateId: string, targetBranch: string, sha: Refs.ShaRef) {
            super(sha)
            this.updateId = updateId
            this.targetBranch = targetBranch
        }
        protected fields(): string[] {
            return [this.updateId, this.targetBranch, this.sha.sha]
        }

        withSha(sha: Refs.ShaRef): UpdateRef {
            return new UpdateRef(this.targetBranch, this.updateId, sha)
        }

        get queueId(): Key {
            return new Key(`integration_${this.targetBranch}`)
        }

        key(): Key {
            return new Key(this.updateId)
        }

        get canonicalId(): string {
            return `update-${this.updateId}`
        }

        toString(): string {
            return `UpdateJobRef:${this.updateId}@${this.sha.sha}`
        }
        static create(fields: string[]): UpdateRef {
            const [id, targetBranch, sha] = fields
            return new UpdateRef(id, targetBranch, Refs.ShaRef.create(sha))
        }
        equals(other: Ref): boolean {
            if (other.sha.equals(this.sha) && other instanceof JobRef.UpdateRef) {
                return other.updateId == this.updateId && other.targetBranch === this.targetBranch
            }
            return false
        }

    }

    export class BranchRef extends Ref {
        @Expose()
        public readonly branch: Refs.BranchRef
        constructor(branch: Refs.BranchRef, sha: Refs.ShaRef) {
            super(sha)
            this.branch = branch
        }
        protected fields(): string[] {
            return [this.branch.name, this.sha.sha]
        }

        withSha(sha: Refs.ShaRef): BranchRef {
            return new BranchRef(this.branch, sha)
        }

        get queueId(): Key {
            return new Key(`${this.branch.name}-${this.sha.sha}`)
        }

        key(): Key {
            return new Key(`${this.branch.name}-${this.sha.sha}`)
        }


        get canonicalId(): string {
            return `${this.branch.name}-${this.sha.sha}`
        }

        toString(): string {
            return `BranchJobRef:${this.branch.name}@${this.sha.sha}`
        }
        static create(fields: string[]): BranchRef {
            const [branch, sha] = fields
            return new BranchRef(Refs.BranchRef.create(branch), Refs.ShaRef.create(sha))
        }
        equals(other: Ref): boolean {
            if (other.sha.equals(this.sha) && other instanceof JobRef.BranchRef) {
                return other.branch.equals(this.branch)
            }
            return false
        }
    }

    export class Key {
        constructor(public readonly id: string) { }
    }
}
