
export namespace Events {

    export const TypeRefUpdated: string = "ref-updated"
    export const TypePatchSetCreated: string = "patchset-created"
    export const TypeChangeAbandoned: string = "change-abandoned"
    export const TypeChangeMerged: string = "change-merged"
    export type BaseEvent = {
        type: string
    }

    export type Change = {
        project: string,
        branch: string,
        id: string,
        number: number,
        url: string,
        subject: string,
        hashtags?: string[]
        private?: boolean
    }

    export type PatchSet = {
        number: number,
        revision: string,
        ref: string
    }

    export type RefUpdateEvent = BaseEvent & {
        refUpdate: {
            project: string
            refName: string
            oldRev: string
            newRev: string
        },
        submitter: {
            name: string,
            email: string,
            username: string
        }
    }

    export type PatchSetCreatedEvent = BaseEvent & {
        project: string,
        refName: string,
        change: Change,
        patchSet: PatchSet
    }

    export type ChangeAbandonedEvent = BaseEvent & {
        project: string,
        refName: string,
        change: Change

    }

    export type ChangeMergedEvent = BaseEvent & {
        project: string,
        refName: string,
        change: Change

    }
}