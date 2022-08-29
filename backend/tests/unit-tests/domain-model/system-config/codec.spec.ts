import { Expose } from 'class-transformer';
import 'reflect-metadata';
import { Codec } from '../../../../src/domain-model/system-config/codec';

class TestClass {
    @Expose()
    public s: string
    @Expose()
    public n: number
    constructor(s: string, n: number) {
        this.s = s
        this.n = n
    }
}

describe("Test codec", () => {
    it("Test serialize", async () => {
        const a = new TestClass("aaa", 100)
        const aPlain = {
            s: "aaa",
            n: 100
        }
        const plain = Codec.toPlain(a)
        expect(plain).toStrictEqual(aPlain)

    })
    it("Test serialize+deserialize", async () => {
        const a = new TestClass("aaa", 100)
        const plain = Codec.toPlain(a)
        const b = Codec.toInstance(plain, TestClass)
        expect(b).toStrictEqual(a)

        const serializedPlain = JSON.stringify(plain)
        const b2 = Codec.toInstance(serializedPlain, TestClass)
        expect(b2).toStrictEqual(a)
    })

    it("Test serialize+deserialize Array", async () => {
        const a = new TestClass("aaa", 100)
        const b = new TestClass("bbb", 200)
        const plain = Codec.toPlain([a, b])

        const c = Codec.toInstances(plain, TestClass)
        expect(c).toStrictEqual([a, b])
    })
})