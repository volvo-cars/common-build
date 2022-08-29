import 'jest'
import { ensureDefined, ensureString, ensureTrue } from '../../../src/utils/ensures'

describe("ensureDefined", () => {
    it("null value should fail", async () => {
        let value = null
        let message = "XXX"
        try {
            ensureDefined(value, message)
            fail("Should have failed")
        }
        catch (e) {
            expect((e as Error).message).toBe(message)
        }
    })
    it("undefined value should fail", async () => {
        let value = null
        let message = "XXX"
        try {
            ensureDefined(value, message)
            fail("Should have failed")
        }
        catch (e) {
            expect((e as Error).message).toBe(message)
        }
    })
    it("0 should pass", async () => {
        let value = 0
        let message = "XXX"
        try {
            expect(ensureDefined(value, message)).toBe(value)
        }
        catch (e) {
            fail("Should have passed. 0 is defined")
        }
    })
})

describe("ensureString", () => {
    it("not string should fail", async () => {
        let value = 2
        let message = "XXX"
        try {
            ensureString(value, message)
            fail("Should have failed")
        }
        catch (e) {
            expect((e as Error).message).toBe(message)
        }
    })
    it("string should pass", async () => {
        let value = "Hello"
        let message = "XXX"
        try {
            ensureString(value, message)
        }
        catch (e) {
            fail("Should have failed")
        }
    })
})

describe("ensureTrue", () => {
    it("false should fail", async () => {
        let value = false
        let message = "XXX"
        try {
            ensureTrue(value, message)
            fail("Should have failed")
        }
        catch (e) {
            expect((e as Error).message).toBe(message)
        }
    })
    it("true should pass", async () => {
        let value = true
        let message = "XXX"
        try {
            ensureTrue(value, message)
        }
        catch (e) {
            fail("Should have failed")
        }
    })
}) 