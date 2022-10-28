import { describe } from '@jest/globals'
import { RepositoryConfig } from '../../../src/domain-model/system-config/repository-config'
import { BuildYamlScanner } from '../../../src/repositories/scanner/providers/build-yaml-scanner-provider'
import { ActionCalculator } from '../../../src/system/action-calculator'

describe("Calculate actions", () => {

    it("Test empty update", () => {
        expect(ActionCalculator.calculateAction([], [])).toBeUndefined()
    })

    it("Test variations", () => {
        expect(ActionCalculator.calculateAction(["test"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release)])).toEqual(RepositoryConfig.Action.Release)
        expect(ActionCalculator.calculateAction(["test", "test2"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release)])).toEqual(RepositoryConfig.Action.Release)
        expect(ActionCalculator.calculateAction(["test", "test2"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release), new RepositoryConfig.LabelAction("test2", RepositoryConfig.Action.Merge)])).toEqual(RepositoryConfig.Action.Release)
        expect(ActionCalculator.calculateAction(["test2"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release), new RepositoryConfig.LabelAction("test2", RepositoryConfig.Action.Merge)])).toEqual(RepositoryConfig.Action.Merge)
        expect(ActionCalculator.calculateAction(["test2"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release), new RepositoryConfig.LabelAction("test2", RepositoryConfig.Action.Nothing)])).toEqual(RepositoryConfig.Action.Nothing)
        expect(ActionCalculator.calculateAction(["test2"], [])).toBeUndefined()


        expect(ActionCalculator.calculateAction(["test2", "test3"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release), new RepositoryConfig.LabelAction("test2", RepositoryConfig.Action.Merge), new RepositoryConfig.LabelAction("test3", RepositoryConfig.Action.Nothing)])).toEqual(RepositoryConfig.Action.Merge)


        expect(ActionCalculator.calculateAction([BuildYamlScanner.DEFAULT_TOOL_LABEL], [new RepositoryConfig.LabelAction(BuildYamlScanner.DEFAULT_TOOL_LABEL, RepositoryConfig.Action.Nothing)])).toBe(RepositoryConfig.Action.Nothing)
        expect(ActionCalculator.calculateAction([BuildYamlScanner.DEFAULT_TOOL_LABEL], [])).toBe(RepositoryConfig.Action.Merge)
        expect(ActionCalculator.calculateAction([BuildYamlScanner.DEFAULT_TOOL_LABEL, "test"], [new RepositoryConfig.LabelAction("test", RepositoryConfig.Action.Release)])).toBe(RepositoryConfig.Action.Release)


    })

})


