import { RepositoryConfig } from "../domain-model/system-config/repository-config";
import { BuildYamlScanner } from "../repositories/scanner/providers/build-yaml-scanner-provider";

export namespace ActionCalculator {
    export const calculateAction = (updateLabels: string[], configActions: RepositoryConfig.LabelAction[]): RepositoryConfig.Action | undefined => {
        const allActions: RepositoryConfig.Action[] = []
        const validConfigActions = configActions.filter(ca => { return updateLabels.includes(ca.id) })
        validConfigActions.forEach(ca => {
            allActions.push(ca.action)
        })
        if (!validConfigActions.find(ca => { return ca.id === BuildYamlScanner.DEFAULT_TOOL_LABEL })) {
            if (updateLabels.includes(BuildYamlScanner.DEFAULT_TOOL_LABEL)) {
                allActions.push(RepositoryConfig.Action.Merge)
            }
        }

        return allActions.includes(RepositoryConfig.Action.Release) ? RepositoryConfig.Action.Release : (allActions.includes(RepositoryConfig.Action.Merge) ? RepositoryConfig.Action.Merge : (allActions.includes(RepositoryConfig.Action.Nothing) ? RepositoryConfig.Action.Nothing : undefined))
    }
}