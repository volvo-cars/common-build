import { createLogger, loggerName } from "../../logging/logging-factory";
import { JobExecutor } from '../job-executor/job-executor';

const logger = createLogger(loggerName(__filename))

export namespace Queue {

    export interface Service {
        start(maxCount: number): Promise<JobExecutor.Key[]>
        push(job: JobExecutor.Key): Promise<void>
        addState(job: JobExecutor.Key, state: State): Promise<boolean>
        getState(job: JobExecutor.Key): Promise<State | undefined>
    }

    export interface Listener {
        onQueueTransition(job: JobExecutor.Key, state: State, previousState: State | undefined): void
    }

    export enum State {
        QUEUED = "queued",
        STARTING = "starting",
        STARTED = "started",
        CANCELLED = "cancelled",
        SUCCEESS = "success",
        FAILURE = "failure", //Logical build failure
        ABORTED = "aborted",
        ERROR = "error", // Infrastructural error (not a build failure)
        TIMEOUT = "timeout", // Expected signals not arriving to Queue within timeout setting,
        CONFLICT = "conflict",
        DEPENDENCY = "dependency",
        REBASED = "rebased"
    }

    export const StateTransitions: Record<State, State[]> = {
        [Queue.State.QUEUED]: [Queue.State.STARTING, Queue.State.CANCELLED],
        [Queue.State.STARTING]: [Queue.State.REBASED, Queue.State.CONFLICT, Queue.State.ABORTED, Queue.State.STARTED, Queue.State.ERROR, Queue.State.TIMEOUT, Queue.State.FAILURE, Queue.State.ABORTED, Queue.State.DEPENDENCY], //FAILURE: Rebase failed, ABORTED: Rebase OK (will come another rebase)
        [Queue.State.STARTED]: [Queue.State.ABORTED, Queue.State.FAILURE, Queue.State.SUCCEESS, Queue.State.ERROR, Queue.State.TIMEOUT],
        [Queue.State.SUCCEESS]: [],
        [Queue.State.FAILURE]: [],
        [Queue.State.ABORTED]: [],
        [Queue.State.CANCELLED]: [],
        [Queue.State.ERROR]: [],
        [Queue.State.TIMEOUT]: [],
        [Queue.State.CONFLICT]: [],
        [Queue.State.DEPENDENCY]: [],
        [Queue.State.REBASED]: []
    }

    export const isStateTerminal = (state: Queue.State): boolean => {
        return StateTransitions[state].length === 0
    }

    export const isTransitionValid = (from: Queue.State, to: Queue.State): boolean => {
        return StateTransitions[from].find(s => { return s === to }) ? true : false
    }

}


