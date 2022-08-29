import { Substitutor, ValueSubstitutor } from "../../../src/config/value-substitutor"

describe("Testing queue functionality", () => {

    const createSubstitutor = (): Substitutor => {
        return new Substitutor([new MockSubstitutor()])
    }

    it("Test empty object", async () => {
        let substitutor = createSubstitutor()
        let o = {}
        expect(await substitutor.substitute(o)).toEqual(o)
    })
    it("Simple replace", async () => {
        let substitutor = createSubstitutor()
        let o = { "test": "my ${dev:somereplace}" }
        let expected = { "test": "my dev-somereplace" }
        expect(await substitutor.substitute(o)).toEqual(expected)
    })
    it("Simple replace multiple occurances", async () => {
        let substitutor = createSubstitutor()
        let o = { "test": "my ${dev:somereplace} ${dev:somereplace2}" }
        let expected = { "test": "my dev-somereplace dev-somereplace2" }
        expect(await substitutor.substitute(o)).toEqual(expected)
    })
})

class MockSubstitutor implements ValueSubstitutor {
    readonly name = "dev"
    value(name: string): Promise<string> {
        return Promise.resolve(`dev-${name}`)
    }
}