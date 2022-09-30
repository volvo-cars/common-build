import { describe, expect, it } from '@jest/globals'
import { BuildLogEvents } from '../../../../src/domain-model/buildlog-events/buildlog-events'
import { Codec } from '../../../../src/domain-model/system-config/codec'

describe("To/From Json", () => {

    it("Codec", async () => {
        const date = new Date()
        const entry = new BuildLogEvents.Entry("aabb", BuildLogEvents.Level.INFO, date)
        const serialized = Codec.toJson(entry)
        const entry2 = Codec.toInstance(serialized, BuildLogEvents.Entry)

        console.log("Serialized entry", serialized)

        expect(entry.message).toBe(entry2.message)
        expect(entry.level).toBe(entry2.level)
        expect(entry.timestamp.getTime()).toBe(entry2.timestamp.getTime())


    })

})