import { JobRef } from "../../domain-model/job-ref/job-ref"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"

export namespace JobExecutor {
    export type LogLevel = "info" | "warning"
    export interface Listener {
        onJobStarted(key: Key): void
        onJobFailure(key: Key): void
        onJobSuccess(key: Key): void
        onJobAborted(key: Key): void
        onJobLog(key: Key, message: string, level: LogLevel): void
        onJobError(key: Key): void
    }

    export interface Executor {
        startJob(key: Key): void
        abortJob(key: Key): void
        setListener(listener: Listener): void
        setInfoUrl(key: JobExecutor.Key, url: string): void
    }

    export class Key {
        constructor(public readonly source: RepositorySource, public readonly jobRef: JobRef.Ref) { }
        private static DELIMITER = "|"
        serialize(): string {
            return `${this.source.asString()}${Key.DELIMITER}${this.jobRef.serialize()}`
        }
        static deserialize(serialized: string): Key {
            const [source, ref] = serialized.split(Key.DELIMITER)
            return new Key(RepositorySource.createFromString(source), JobRef.Ref.deserialize(ref))
        }
        toString(): string {
            return `Job: ${this.source.asString()}[${this.jobRef}]`
        }
        equals(other: Key): boolean {
            return this.source.equals(other.source) && this.jobRef.equals(other.jobRef)
        }
    }
}

