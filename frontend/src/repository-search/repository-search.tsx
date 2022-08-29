import { AxiosResponse } from "axios"
import { useEffect, useState } from "react"
import _ from "lodash"
import { Http } from "../utils/http"
import { RepositorySource } from "../domain-model/repository-model/repository-source"
import { Codec } from "../domain-model/system-config/codec"
import { CtrlSelect } from "../forms/ctrl-select"
import { ApiAdmin } from "../domain-model/api/admin"

type Props = {
    onSelect: (source: RepositorySource) => void
}

export const RepositorySearch = ({ onSelect }: Props) => {
    const [repositoryList, setRepositoryList] = useState<RepositorySource[] | undefined>()
    useEffect(() => {
        Http.createRequest("/api/admin/repositories").execute().then((response: AxiosResponse<any>) => {
            const repositories = Codec.toInstance(response.data, ApiAdmin.ActiveRepositoriesResponse).sources
            setRepositoryList(_.sortBy(repositories, (r) => {
                return r.path
            }))
        })

    }, [])


    return (<CtrlSelect<RepositorySource>

        isLoading={repositoryList === undefined}
        placeholder={`Find repository...`}
        options={repositoryList || []}
        onChange={(selected) => {
            if (selected) {
                onSelect(selected)
            }
        }}
        transformLabel={(o: RepositorySource) => { return `${o.id}:${o.path}` }}
        width={300}
    />)
}