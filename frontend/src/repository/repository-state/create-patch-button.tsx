import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { CtrlButton } from "../../forms/ctrl-button"

type Props = {
    major: RepositoryModel.MajorContainer
    onClick: () => void
}
export const CreatePatchButton = ({ major, onClick }: Props) => {
    let buttonInfo = {
        disabled: false,
        tooltip: `Create patch branch for patch releases of major ${major.major}`
    }
    if (major.branch) {
        buttonInfo.disabled = true
        buttonInfo.tooltip = "Patch branch already exists."
    }

    return (<CtrlButton.Button size="sm" config={{ isDisabled: buttonInfo.disabled, toolTip: buttonInfo.tooltip, hideIcon: true }} onClick={onClick}>Patch branch</CtrlButton.Button>)

}