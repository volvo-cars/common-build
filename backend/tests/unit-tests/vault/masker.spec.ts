import 'jest'
import { maskValues } from '../../../src/vault/masker'

describe("Testing masker", () => {
    it("Simple string", async () => {
        let secrets = ["XXX"]
        expect(maskValues("This is the secret:XXX!", secrets)).toBe("This is the secret:**3**!")

    })
    it("Number", async () => {
        let secrets = ["XXX"]
        expect(maskValues(1, secrets)).toBe(1)

    })
    it("Boolean", async () => {
        let secrets = ["XXX"]
        expect(maskValues(true, secrets)).toBe(true)
        expect(maskValues(false, secrets)).toBe(false)
    })
    it("Object", async () => {
        let secrets = ["XXX"]
        const value = {
            "a": "zXXXy",
            "b": "Hello"
        }
        expect(maskValues(value, secrets)).toEqual({
            "a": "z**3**y",
            "b": "Hello"
        })
    })
    it("Array", async () => {
        let secrets = ["XXX", "ZZZZ"]
        const value = ["zXXXy", "HelloZZZZ"]
        expect(maskValues(value, secrets)).toEqual(["z**3**y", "Hello**4**"])
    })

})