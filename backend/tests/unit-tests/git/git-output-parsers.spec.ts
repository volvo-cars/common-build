import 'jest'
import { GitOutputParser } from '../../../src/git/git-output-parsers'

describe("parseTags", () => {
    it("Picks dereferenced commit if exits", async () => {
        const output1 = `ba1f0c8c6dae727515a71dbd4238234265a060ce refs/tags/major-1
f2e4a205eafcc49d0dddb7b9eede5cc54041bcc1 refs/tags/major-1^{}
7eba3a34346d9959a0dad59795281522f0379367 refs/tags/v0.0.0
209b77f8847c8888bd7aff4bd3eed6eb4e7f4360 refs/tags/v0.1.0
dd87f7f9eb6c514aedb1e53feb52dd5bf068d23b refs/tags/v0.1.0^{}
7160ce72c79052b0cb00738789048166d58788ec refs/tags/v0.2.0^{}
fc79e5e9e2ffdab3246e752c5fe433e9c3eab127 refs/tags/v0.2.0
`
        const tags = GitOutputParser.parseReferences(output1)
        const v000 = tags.find(t => { return t.ref.name === 'v0.0.0' })
        expect(v000).toBeDefined()
        expect(v000?.sha.sha).toBe("7eba3a34346d9959a0dad59795281522f0379367")

        const v010 = tags.find(t => { return t.ref.name === 'v0.1.0' })
        expect(v010).toBeDefined()
        expect(v010?.sha.sha).toBe("dd87f7f9eb6c514aedb1e53feb52dd5bf068d23b")

        const v020 = tags.find(t => { return t.ref.name === 'v0.2.0' })
        expect(v020).toBeDefined()
        expect(v020?.sha.sha).toBe("7160ce72c79052b0cb00738789048166d58788ec")

    })
})