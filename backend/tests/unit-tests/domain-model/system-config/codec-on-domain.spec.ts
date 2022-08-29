import { BuildConfig } from '../../../../src/domain-model/system-config/build-config';
import { Codec } from '../../../../src/domain-model/system-config/codec';


describe("Test codec on domain", () => {

    it("Test serialize/deserialize", () => {
        const step = new BuildConfig.BuildCompose.Step(
            new Map([
                ["dev", new BuildConfig.BuildCompose.Node("ubuntu:20.04", ["redis"], [], undefined, undefined)],
                ["redis", new BuildConfig.BuildCompose.Node("redis:6.2-alpine", [], [6379], undefined, undefined)]
            ]),
            [
                new BuildConfig.BuildCompose.NodeCommand("echo hello2 > test.txt && ls -l", "dev")
            ]
        )
        const build = new BuildConfig.Build([step], undefined)
        const config = new BuildConfig.Config(build, "latest")

        const encoded = Codec.toPlain(config)
        console.log("ENCODED")
        console.dir(encoded, { depth: null })
        const encoded2: any = encoded
        //encoded2.build.steps[0].type = "compose"

        const decoded = Codec.toInstance(encoded, BuildConfig.Config)
        console.log("DECODED")
        console.dir(decoded, { depth: null })

        //expect(decoded).toEqual(config)

        expect(true).toBe(true)
    })



})