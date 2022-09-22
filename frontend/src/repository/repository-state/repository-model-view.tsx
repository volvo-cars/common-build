import { Row, Col } from "react-bootstrap";
import { RepositoryModel } from "../../domain-model/repository-model/repository-model";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";

import { HistoricContainerActions } from "./historic-container-actions";
import { MainContainerActions } from "./main-container-actions";
import { RepositoryModelRow } from "./repository-model-row";
type Props = {
    source: RepositorySource
    model: RepositoryModel.Root
    onRelease: (major: RepositoryModel.TopContainer, viewSha: string) => void
    onPatch: (major: RepositoryModel.TopContainer) => void
}


export const RepositoryModelView = ({ source, model, onRelease, onPatch }: Props) => {
    return (
        <Row>
            <Col className="repository-rows-container" style={{ marginTop: 20 }}>
                <RepositoryModelRow major={model.main} source={source}>
                    <MainContainerActions major={model.main} onRelease={(viewSha: string) => { onRelease(model.main, viewSha) }} source={source} />
                </RepositoryModelRow>
                {model.majors.map((historic) => {
                    return (
                        <RepositoryModelRow major={historic} source={source} key={historic.major}>
                            <HistoricContainerActions major={historic} onRelease={(viewSha: string) => { onRelease(historic, viewSha) }} onPatch={() => { onPatch(historic) }} source={source} />
                        </RepositoryModelRow>
                    )
                })}
            </Col>
        </Row>
    )
}


