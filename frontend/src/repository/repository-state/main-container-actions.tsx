import { ButtonGroup } from "react-bootstrap"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { ReleaseButton } from "./release-button"
type Props = {
    source: RepositorySource
    major: RepositoryModel.MainContainer
    onRelease: (viewSha: string) => void
}

export const MainContainerActions = ({ source, major, onRelease }: Props) => {
    return (
        <ButtonGroup>
            <ReleaseButton branchSha={major.main.sha} major={major} onClick={() => onRelease(major.main.sha)} />
        </ButtonGroup>
    )
}







