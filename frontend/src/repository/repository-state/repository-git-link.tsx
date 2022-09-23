import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { RepositorySourceUtil } from "../../utils/repository-source-util"
type Props = {
    source: RepositorySource,
    branchName: string,
}

export const RepositoryGitLink = ({ source, branchName }: Props) => {
    return (<a className="repository-git-link" href={RepositorySourceUtil.repositoryBranchUrl(source, branchName)} target="_blank">{branchName}</a>)
}