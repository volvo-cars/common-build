import { JsonUtils } from "../../../src/utils/json-utils"

describe("JsonUtils", () => {

    it("normal", async () => {
        const o = {
            a: {
                c: [1, 2, 3]
            }
        }
        expect(JsonUtils.parse(JsonUtils.stringify(o))).toEqual(o)
    })
    it("with Map", async () => {
        const o = {
            a: {
                c: new Map([['d', 'text']])
            }
        }
        expect(JsonUtils.parse(JsonUtils.stringify(o))).toEqual(o)
    })
})