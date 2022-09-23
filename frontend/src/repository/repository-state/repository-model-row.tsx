import { Col, Row } from "react-bootstrap";
import { RepositoryModel } from "../../domain-model/repository-model/repository-model";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { CtrlTooltip } from "../../forms/ctrl-tooltip";

import { LastVersion } from "./last-version";
import { RepositoryGitLink } from "./repository-git-link";
type Props = {
    major: RepositoryModel.TopContainer
    source: RepositorySource
}



export const RepositoryModelRow = ({ major, source, children }: React.PropsWithChildren<Props>) => {

    const [branchName, sha] = major.branchAndSha() || []

    return (
        <>
            <Row className="align-items-center">
                <Col xs={5}>
                    <div className="major-title-container">
                        <div className="major-title"><CtrlTooltip message={`Major ${major.major}.`} hideIcon={true}>{major.major}</CtrlTooltip></div>
                        <div className="major-latest-version"><CtrlTooltip message={`Latest version released from major ${major.major}`} hideIcon={true}><LastVersion major={major} /></CtrlTooltip></div>
                        {(branchName && sha) &&
                            <RepositoryGitLink branchName={branchName} source={source} />
                        }
                    </div>
                </Col>
                <Col xs={7}>
                    {children}
                </Col>
            </Row>
        </>
    )
}


