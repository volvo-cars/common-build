import 'jest'
import { chopString, encodeReplace, splitAndFilter } from '../../../src/utils/string-util'

describe("replacer works", () => {

    it("dont touch non escaped", async () => {
        expect(encodeReplace("abc")).toBe("abc")
    })
    it("encodes escaped", async () => {
        expect(encodeReplace("abc{d/e}f")).toBe("abcd%2Fef")
        expect(encodeReplace("{project/a/b}")).toBe("project%2Fa%2Fb")
    })
})
describe("splitAndFilter works", () => {

    it("test variants", async () => {
        expect(splitAndFilter("")).toEqual([])
        expect(splitAndFilter("a,b,c")).toEqual(["a", "b", "c"])
        expect(splitAndFilter("a,,c")).toEqual(["a", "c"])
        expect(splitAndFilter("a  ,  ,  c")).toEqual(["a", "c"])
        expect(splitAndFilter("  a  ,  b  ,  c  ")).toEqual(["a", "b", "c"])
        expect(splitAndFilter("  a  b c ")).toEqual(["a", "b", "c"])
    })

})

describe("chop works", () => {

    it("test variants", async () => {
        expect(chopString("", 0)).toBe("")
        expect(chopString("abc", 1)).toBe("a...")
        expect(chopString("abc", 2)).toBe("ab...")
        expect(chopString("abc", 3)).toBe("abc")
    })

})
