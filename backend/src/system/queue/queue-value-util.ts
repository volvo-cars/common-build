import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { JobRef } from "../job-executor/job-ref"

export const deserializeQueueValue = (string: string): [RepositorySource, JobRef] => {
    const [originPart, refPart] = string.split("|")
    if (originPart && refPart) {
        const [id, path] = originPart.split(":")
        if (id && path) {
            return [new RepositorySource(id, path)
                , JobRef.deserialize(refPart)]
        } else {
            throw new Error(`Could not parse RepositoryId:`)
        }
    } else {
        throw new Error(`Could not parse QueueValue:${string}`)
    }
}

export const serializeQueueValue = (source: RepositorySource, ref: JobRef): string => {
    return `${source.id}:${source.path}|${ref.serialize()}`
}