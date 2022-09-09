import { Refs } from "../../domain-model/refs"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { JobRef } from "./job-ref"

export namespace JobExecutor {
    export interface Listener {
        onJobStarted(key: Key): void
        onJobFailure(key: Key): void
        onJobSuccess(key: Key): void
        onJobAborted(key: Key): void
        onJobError(key: Key): void
    }

    export interface Executor {
        startJob(key: Key): void
        abortJob(key: Key): void
        setListener(listener: Listener): void
    }

    export class Key {
        constructor(public readonly source: RepositorySource, public readonly ref: JobRef, public readonly sha: Refs.ShaRef) { }
        private static DELIMITER = "|"
        serialize(): string {
            return `${this.source.asString()}${Key.DELIMITER}${this.ref.serialize()}${Key.DELIMITER}${this.sha.sha}`
        }
        static deserialize(serialized: string): Key {
            const [source, ref, sha] = serialized.split(Key.DELIMITER)
            return new Key(RepositorySource.createFromString(source), JobRef.deserialize(ref), Refs.ShaRef.create(sha))
        }
        toString(): string {
            return `Job: ${this.source.id}/${this.source.path}/[${this.ref.type}]${this.ref.ref}/${this.sha.sha}`
        }
        equals(other: Key): boolean {
            return this.source.id === other.source.id && this.source.path === other.source.path &&
                this.ref.type === other.ref.type && this.ref.ref === other.ref.ref &&
                this.sha.sha === other.sha.sha
        }
    }
}

