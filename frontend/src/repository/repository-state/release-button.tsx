import _ from "lodash"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { CtrlButton } from "../../forms/ctrl-button"

type Props = {
    branchSha?: string
    major: RepositoryModel.TopContainer
    onClick: () => void
}
export const ReleaseButton = ({ major, branchSha, onClick }: Props) => {
    let buttonInfo = {
        disabled: false,
        tooltip: "Release next version"
    }
    const lastRelease = _.first(_.first(major.minors)?.releases)
    if (lastRelease && lastRelease.sha === branchSha) {
        buttonInfo.disabled = true
        buttonInfo.tooltip = "The latest release is on the same sha as the branch (Nothing to release)."
    }
    if (!branchSha) {
        buttonInfo.disabled = true
        buttonInfo.tooltip = "You must first create a patch branch in order to release."
    }
    return (<CtrlButton.Button size="sm" config={{ isDisabled: buttonInfo.disabled, toolTip: buttonInfo.tooltip, hideIcon: true }} onClick={onClick}>Release</CtrlButton.Button>)
}