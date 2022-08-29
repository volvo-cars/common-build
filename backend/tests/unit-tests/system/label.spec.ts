import 'jest'
import { coversAll, extractFirstLabel } from '../../../src/system/label'
import { ensureDefined } from '../../../src/utils/ensures'

jest.setTimeout(10 * 1000)
describe("Testing single Label", () => {
    it("Parse simple label", async () => {
        let txt = "src:src/server"
        let label = ensureDefined(extractFirstLabel(txt))
        expect(label.label).toBe(txt)
    })

    it("Mismatching types fail", async () => {
        let src = ensureDefined(extractFirstLabel("src:src/server"))
        let dest = ensureDefined(extractFirstLabel("dest:src/server"))
        expect(src.covers(dest)).toBe(false)
        expect(dest.covers(src)).toBe(false)
    })

    it("Covers", async () => {
        let labelSrcServer = ensureDefined(extractFirstLabel("src:src-code/server"))
        let labelSrc = ensureDefined(extractFirstLabel("src:src-code"))
        expect(labelSrc.covers(labelSrcServer)).toBe(true)
        expect(labelSrcServer.covers(labelSrc)).toBe(false)
    })

    it("Empty Covers all", async () => {
        let labelSrcServer = ensureDefined(extractFirstLabel("src:src-code/server"))
        let labelSrc = ensureDefined(extractFirstLabel("src:src-code"))
        let label = ensureDefined(extractFirstLabel("src"))
        expect(label.covers(labelSrcServer)).toBe(true)
        expect(label.covers(labelSrc)).toBe(true)

        expect(labelSrcServer.covers(label)).toBe(false)
        expect(labelSrc.covers(label)).toBe(false)
    })

})

describe("Testing coversAll Labels", () => {
    it("1-1 => false", async () => {
        let required = [ensureDefined(extractFirstLabel("dest:node"))]
        let available = [ensureDefined(extractFirstLabel("dest:doc"))]
        expect(coversAll(required, available)).toBe(false)
    })

    it("1-1 => false", async () => {
        let required = [ensureDefined(extractFirstLabel("dest:node/a"))]
        let available = [ensureDefined(extractFirstLabel("dest:node"))]
        expect(coversAll(required, available)).toBe(true)
    })

    it("2-1 => true", async () => {
        let required = [ensureDefined(extractFirstLabel("dest:node/a")), ensureDefined(extractFirstLabel("dest:node/b"))]
        let available = [ensureDefined(extractFirstLabel("dest:node"))]
        expect(coversAll(required, available)).toBe(true)
    })


})