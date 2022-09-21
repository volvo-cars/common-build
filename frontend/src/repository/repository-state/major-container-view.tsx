import { Button, ButtonGroup, ButtonToolbar, Col, Form, Row } from "react-bootstrap"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { RepositorySourceUtil } from "../../utils/repository-source-util"
import { FaExternalLinkAlt as ExternalIcon } from 'react-icons/fa'
import { Styles } from "../../Styles";
import _ from 'lodash'
import { CtrlTooltip } from "../../forms/ctrl-tooltip"
type Props = & {
    source: RepositorySource
    major: RepositoryModel.TopContainer
    onRelease: (sha?: string) => void
    onPatch?: () => void
}

export const MajorContainerView = ({ source, major, onRelease, onPatch }: Props) => {
    const mainMajor = (major instanceof RepositoryModel.MainContainer) ? major as RepositoryModel.MainContainer : undefined
    const historicMajor = (major instanceof RepositoryModel.MajorContainer) ? major as RepositoryModel.MajorContainer : undefined

    return (
        <>
            <Row className="align-items-center mt-1 mb-1">
                <Col xs={2}><span style={{ fontSize: 30 }}>{major.major}</span></Col>
                {mainMajor &&
                    <>

                        <Col xs={2}><BranchLink source={source} branchName={mainMajor.main.name} exists={true} /></Col>
                        <Col xs={4}>
                            <ButtonGroup>
                                <ReleaseButton branchSha={mainMajor.main.sha} major={mainMajor} onClick={() => onRelease(mainMajor.main.sha)} />
                            </ButtonGroup>
                        </Col>
                    </>
                }
                {historicMajor &&
                    <>
                        <Col xs={2}><BranchLink source={source} branchName={`patch-${historicMajor.major}`} exists={historicMajor.branch ? true : false} /></Col>
                        <Col xs={4}>
                            <ButtonGroup>
                                <ReleaseButton branchSha={historicMajor.branch} major={historicMajor} onClick={() => onRelease(historicMajor.branch)} />
                                <CreatePatchButton major={historicMajor} onClick={onPatch || (() => { })} />
                            </ButtonGroup>
                        </Col>
                    </>
                }
            </Row>
            <Row className="align-items-center mt-1 mb-1 border-bottom">
                <Col>
                    <div><small>Latest release <LastVersion major={major} /></small></div>
                </Col>
            </Row>
        </>
    )
}

type BranchLinkProps = {
    source: RepositorySource,
    branchName: string,
    exists: boolean
}

const BranchLink = ({ source, branchName, exists }: BranchLinkProps) => {
    if (exists) {
        return (<a href={RepositorySourceUtil.repositoryBranchUrl(source, branchName)} target="_blank">{branchName} <ExternalIcon style={Styles.Icon} /></a>)
    } else {
        return (<span>{branchName}</span>)
    }
}
type ReleaseButtonProps = {
    branchSha?: string
    major: RepositoryModel.TopContainer
    onClick: () => void
}
const ReleaseButton = ({ major, branchSha, onClick }: ReleaseButtonProps) => {
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


    const attributes = buttonInfo.disabled ? { "disabled": true } : {}
    return (
        <CtrlTooltip message={buttonInfo.tooltip} hideIcon={true}>
            <Button {...attributes} variant="primary" onClick={onClick}>Release</Button>
        </CtrlTooltip>
    )
}
type CreatePatchButtonProps = {
    major: RepositoryModel.MajorContainer
    onClick: () => void
}
const CreatePatchButton = ({ major, onClick }: CreatePatchButtonProps) => {
    let buttonInfo = {
        disabled: false,
        tooltip: `Create patch branch for patch releases of major ${major.major}`
    }
    if (major.branch) {
        buttonInfo.disabled = true
        buttonInfo.tooltip = "Patch branch already exists."
    }

    const attributes = buttonInfo.disabled ? { "disabled": true } : {}
    return (
        <CtrlTooltip message={buttonInfo.tooltip} hideIcon={true}>
            <Button {...attributes} variant="primary" onClick={onClick}>Patch branch</Button>
        </CtrlTooltip>
    )
}

type LastVersionProps = {
    major: RepositoryModel.TopContainer
}
const LastVersion = ({ major }: LastVersionProps) => {

    const lastMinorWithReleases = major.minors.find(m => { return m.releases.length > 0 })

    const version = lastMinorWithReleases ? `${major.major}.${lastMinorWithReleases.minor}.${lastMinorWithReleases.releases[0].patch}` : undefined
    return (<span>{version || "-"}</span>)
}

