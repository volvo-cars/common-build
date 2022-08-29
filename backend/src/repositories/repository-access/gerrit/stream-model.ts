export namespace Event {

    export type BaseEvent = {
        type: ChangeType,
        eventCreated: number
    }

    export type RefUpdatedEvent = BaseEvent & {
        refUpdate: RefUpdate
    }

    export type RefUpdate = {
        project: string,
        refName: string,
        oldRev: string,
        newRev: string
    }

    export type Change = {
        project: string,
        id: string,
        title: string
        status: ChangeStatus
    }

    export type Key = {
        id: string
    }

    export enum ChangeStatus {
        NEW = "NEW"
    }

    export enum ChangeType {
        commentAdded = "comment-added",
        refUpdated = "ref-updated"
    }
}