import { classToPlain, instanceToPlain, plainToClass, plainToClassFromExist, plainToInstance, serialize } from 'class-transformer';
import 'reflect-metadata';
import { BuildConfig } from "../../../../src/domain-model/system-config/build-config"
import YAML from 'yaml'
describe("Test Ref", () => {
    it("Test simple serializer", async () => {
        const config = new BuildConfig.Config(
            new BuildConfig.Build(
                [new BuildConfig.BuildCompose.Step(
                    new Map([
                        [
                            "redis", new BuildConfig.BuildCompose.Node(
                                "redis:6.2-alpine",
                                undefined,
                                undefined,
                                undefined,
                                undefined
                            )
                        ],
                        [
                            "dev", new BuildConfig.BuildCompose.Node(
                                "inhouse-dev:1.0.0", undefined, [], "redis", undefined
                            )
                        ]
                    ]),
                    [
                        new BuildConfig.BuildCompose.NodeCommand("npm run test", "dev"),
                        new BuildConfig.BuildCompose.NodeCommand("npm pack", "dev")
                    ]),
                new BuildConfig.BuildDockerBuild.Step("vcc/common-build", "docker/vcc-common-build.dockerfile", undefined, undefined),
                new BuildConfig.BuildNative.Step("sign it")

                ]
            )
        )
        const json = JSON.stringify(instanceToPlain(config), null, 2)
        //const json = JSON.stringify(config, instanceToPlain(config, { excludeExtraneousValues: true })) asd asd
        const recreated = plainToInstance(BuildConfig.Config, JSON.parse(json))
        console.log(YAML.stringify(instanceToPlain(config)))
        console.log(json)
        //  console.dir(recreated, { depth: null })

    })

    it("One container build", async () => {
        const config = new BuildConfig.Config(
            new BuildConfig.Build(
                [new BuildConfig.BuildCompose.Step(
                    new Map([
                        [
                            "dev", new BuildConfig.BuildCompose.Node(
                                "inhouse-dev:1.0.0", undefined, undefined, undefined, undefined
                            )
                        ]
                    ]),
                    [
                        new BuildConfig.BuildCompose.NodeCommand("cmake ..", "dev"),
                        new BuildConfig.BuildCompose.NodeCommand("make", "dev"),
                    ])
                ]
            )
        )
        const json = JSON.stringify(instanceToPlain(config), null, 2)
        console.log("OUT2", json)
        //const json = JSON.stringify(config, instanceToPlain(config, { excludeExtraneousValues: true })) asd asd
        const recreated = plainToInstance(BuildConfig.Config, <object>JSON.parse(json))
        console.log("RECREATED")
        console.dir(recreated, { depth: null })
        expect(recreated.build.steps[0]).toBeInstanceOf(BuildConfig.BuildCompose.Step)
        console.log(YAML.stringify(instanceToPlain(config)))
        console.log(json)

    })


})