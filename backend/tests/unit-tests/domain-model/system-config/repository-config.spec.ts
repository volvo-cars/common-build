import { classToPlain, instanceToPlain, plainToClass, plainToClassFromExist, plainToInstance, serialize } from 'class-transformer';
import 'reflect-metadata';
import { RepositoryConfig } from '../../../../src/domain-model/system-config/repository-config';

describe("Test Ref", () => {
    it("Test simple serializer", async () => {
        const config = new RepositoryConfig.Config(
            new RepositoryConfig.BuildAutomation(
                RepositoryConfig.Action.Merge,
                [new RepositoryConfig.LabelAction("ssa", RepositoryConfig.Action.Release)]
            ),
            new RepositoryConfig.MajorSerie("csp", true)
        )
        const json = JSON.stringify(instanceToPlain(config), null, 2)
        //const json = JSON.stringify(config, instanceToPlain(config, { excludeExtraneousValues: true })) asd asd
        const recreated = plainToInstance(RepositoryConfig.Config, JSON.parse(json))

        console.log(json)
        console.dir(recreated, { depth: null })

    })


})