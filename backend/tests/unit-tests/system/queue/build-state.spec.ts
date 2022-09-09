import { describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { BuildState } from '../../../../src/system/queue/build-state'
import { QueueStatus } from '../../../../src/system/queue/queue'

describe("Build state", () => {
    it("Create", async () => {
        let state = BuildState.create(QueueStatus.QUEUED, 1)
        expect(state.current().status).toBe(QueueStatus.QUEUED)
        expect(state.current().timestamp).toBe(1)
    })
    it("Push", async () => {
        let state = BuildState.create(QueueStatus.QUEUED, 1)
        let state2 = state.push(QueueStatus.STARTING, 2)
        expect(state2.current().status).toBe(QueueStatus.STARTING)
        expect(state2.current().timestamp).toBe(2)
    })
    it("Push Illegal", async () => {
        let state = BuildState.create(QueueStatus.QUEUED, 1)
        expect(() => state.push(QueueStatus.SUCCEESS, 2)).toThrowError()
        //     expect(() => state.push(QueueStatus.STARTING, 0)).toThrowError()  // Removed timing for the time being.
        expect(() => state.push(QueueStatus.QUEUED, 3)).toThrowError() // Re-entreant
    })
}) 