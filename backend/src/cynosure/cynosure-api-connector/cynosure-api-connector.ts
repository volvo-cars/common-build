import { Refs } from "../../domain-model/refs"
import { RepositoryPath } from "../../domain-model/repository-model/repository-source"

export interface CynosureApiConnector {
    findProductId(path: RepositoryPath): Promise<CynosureProtocol.ProductId | undefined>
    findActivity(productId: CynosureProtocol.ProductId, sha: Refs.ShaRef, timeout?: number): Promise<CynosureProtocol.Activity | undefined>
    /**
     * Starts the build for at Cynosure
     * @param productId 
     * @param sha 
     * @return true if started false if not
     */
    startActivity(productId: CynosureProtocol.ProductId, sha: Refs.ShaRef): Promise<boolean>
    abortActivity(activityId: CynosureProtocol.ActivityId, sha: Refs.ShaRef, reason: string): Promise<void>
}

export namespace CynosureProtocol {
    export type ProductId = string
    export type ActivityId = string
    export type FindProductResponse = Product[]
    export type FindActivityResponse = Activity[]

    export type Product = {
        type: string,
        namespace: string,
        title: string
    }

    export enum ActivityState {
        UNKNOWN = "unknown",
        FINISHED = "finished",
        ALLOCATED = "allocated",
        ONGOING = "ongoing",
        QUEUED = "queued"
    }

    export enum ActivityVerdict {
        PASSED = "passed",
        FAILED = "failed",
        ERRORED = "errored",
        SKIPPED = "skipped",
        ABORTED = "aborted"
    }

    export type Activity = {
        activityId: string,
        state: ActivityState
        verdict: ActivityVerdict
    }
}
