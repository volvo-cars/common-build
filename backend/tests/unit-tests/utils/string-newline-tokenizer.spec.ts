import { describe, expect, it } from '@jest/globals'
import { stringNewlineTokenizer } from '../../../src/utils/string-newline-tokenizer'

describe("StringWhitespaceTokenizer test", () => {
    it("Empty string should emit zero events and return empty string", async () => {
        let events = []
        let full = ""
        let newFull = stringNewlineTokenizer(full, (event: string) => { events.push(event) })
        expect(events.length).toBe(0)
        expect(newFull).toBe("")
    })
    it("Single events consumed. Last one in progress kept.", async () => {
        let events: string[] = []
        let full = `
event1
event2

event3
event3notdone`
        let newFull = stringNewlineTokenizer(full, (event: string) => { events.push(event) })
        expect(events.length).toBe(3)
        expect(events[0]).toBe("event1")
        expect(events[1]).toBe("event2")
        expect(events[2]).toBe("event3")
        expect(newFull).toBe("event3notdone")
    })
}) 