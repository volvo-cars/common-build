import { ButtonGroup } from "react-bootstrap"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { CreatePatchButton } from "./create-patch-button"
import { ReleaseButton } from "./release-button"
type Props = {
    source: RepositorySource
    major: RepositoryModel.MajorContainer
    onRelease: (viewSha: string) => void
    onPatch: () => void
}

export const HistoricContainerActions = ({ source, major, onRelease, onPatch }: Props) => {
    return (
        <ButtonGroup>
            <ReleaseButton branchSha={major.branch} major={major} onClick={() => onRelease(major.branch as string)} />
            {!major.branch &&
                <CreatePatchButton major={major} onClick={onPatch || (() => { })} />
            }
        </ButtonGroup>
    )
}







