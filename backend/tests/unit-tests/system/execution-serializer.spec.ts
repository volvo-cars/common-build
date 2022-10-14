import { describe, expect, it } from '@jest/globals'
import { createExecutionSerializer, ExecutionSerializer } from "../../../src/system/execution-serializer"

describe("Test Execution-Serializer", () => {

    const createSerializer = (): ExecutionSerializer => {
        return createExecutionSerializer()
    }

    it("Make sure order is kept", async () => {
        let serializer = createSerializer()
        let keyA = "A"
        let a1 = serializer.execute(keyA, () => createTestPromise(100))
        let a2 = serializer.execute(keyA, () => createTestPromise(10))
        let a3 = serializer.execute(keyA, () => createTestPromise(50))
        let a4 = serializer.execute(keyA, () => createTestPromise(0))
        let a5 = serializer.execute(keyA, () => createTestPromise(50))

        let [r1, r2, r3, r4, r5] = await Promise.all([a1, a2, a3, a4, a5])
        expect(r1).toEqual([1, 1])
        expect(r2).toEqual([2, 2])
        expect(r3).toEqual([3, 3])
        expect(r4).toEqual([4, 4])
        expect(r5).toEqual([5, 5])
    })
})

let completeCount = 0
let creationCount = 0

const createTestPromise = (waitTime: number): Promise<[number, number]> => {
    creationCount++
    const created = creationCount
    return new Promise<[number, number]>((resolve, reject) => {
        setTimeout(() => {
            completeCount++
            resolve([created, completeCount])
        }, waitTime)
    })
}

