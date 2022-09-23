import { RepositoryModel } from "../../domain-model/repository-model/repository-model"

type Props = {
    major: RepositoryModel.TopContainer
}
export const LastVersion = ({ major }: Props) => {

    const lastMinorWithReleases = major.minors.find(m => { return m.releases.length > 0 })

    const version = lastMinorWithReleases ? `${major.major}.${lastMinorWithReleases.minor}.${lastMinorWithReleases.releases[0].patch}` : undefined
    return (<span>{version || "-"}</span>)
}