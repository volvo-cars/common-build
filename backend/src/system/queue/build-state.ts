import _ from "lodash"
import { ensureDefined } from "../../utils/ensures"
import { QueueStatus, QueueStatusTransitions } from "./queue"

export type BuildStateStep = {
    status: QueueStatus,
    timestamp: number
}

export class BuildState {

    private steps: BuildStateStep[]

    private constructor(steps: BuildStateStep[]) {
        this.steps = steps
    }

    static create(status: QueueStatus, timestamp: number): BuildState {
        return new BuildState([{ status: status, timestamp: timestamp }])
    }

    static deserialize(string: string): BuildState {
        return new BuildState(JSON.parse(string))
    }

    push(status: QueueStatus, timestamp: number): BuildState {
        let currentStatus = this.current()
        if (timestamp < this.current().timestamp) {
            throw new Error("Can not an earlier event.")
        }
        if (currentStatus.status === status) {
            throw new Error(`Can not re-enter state: ${status}`)
        }
        if (_.includes(QueueStatusTransitions[currentStatus.status], status)) {
            let copiedSteps = _.clone(this.steps)
            copiedSteps.unshift({ status: status, timestamp: timestamp })
            return new BuildState(copiedSteps)
        } else {
            throw new Error(`Invalid transition ${currentStatus.status} -> ${status}`)
        }
    }

    current(): BuildStateStep {
        return ensureDefined(_.first(this.steps))
    }

    created(): number {
        return ensureDefined(_.last(this.steps)).timestamp
    }

    serialize(): string {
        return JSON.stringify(this.steps)
    }

}

