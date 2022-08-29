import { AxiosResponse } from "axios"
import { useEffect, useState } from "react"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { Majors } from "../../domain-model/system-config/majors"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
import _ from "lodash"
import { MajorContainerView } from "./major-container-view"
import { Col, Row } from "react-bootstrap"
import { ApiRepository } from "../../domain-model/api/repository"
type Props = {
    source: RepositorySource
}

export const RepositoryState = ({ source }: Props) => {
    const [model, setModel] = useState<RepositoryModel.Root | undefined>()
    const [series, setSeries] = useState<Majors.Serie[] | undefined>()
    const notification = useNotifications()
    useEffect(() => {
        const t = setTimeout(() => {
            setModel(undefined)
        }, 400)
        Http.createRequest("/api/repository/model", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.SourceRequest(source))).execute().then((response: AxiosResponse<ApiRepository.ModelResponse>) => {
            clearTimeout(t)
            setModel(Codec.toInstance(response.data.model, RepositoryModel.Root))
        }).catch(e => {
            notification.error(`${e}`)
        })
    }, [source.id, source.path])
    useEffect(() => {
        Http.createRequest("/api/admin/majors/values").execute().then((response: AxiosResponse<any>) => {
            const series = Codec.toInstances(response.data, Majors.Serie)
            setSeries(series)
        }).catch(e => {
            notification.error(`${e}`)
        })

    }, [])
    const onRelease = (major: RepositoryModel.TopContainer, sha?: string) => {
        Http.createRequest("/api/repository/release", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.ReleaseRequest(source, major.major, sha))).execute().then((response: AxiosResponse<any>) => {
            const parsedResponse = Codec.toInstance(response.data, ApiRepository.ReleaseResponse)
            notification.info(parsedResponse.message)
            setModel(parsedResponse.model)
        }).catch(e => {
            notification.error(`${e}`)
        })
    }
    const onPatch = (major: RepositoryModel.MajorContainer, sha?: string) => {
        Http.createRequest("/api/repository/patch", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.CreatePatchBranchRequest(source, major.major, sha))).execute().then((response: AxiosResponse<any>) => {
            const parsedResponse = Codec.toInstance(response.data, ApiRepository.CreatePatchBranchResponse)
            notification.info(parsedResponse.message)
            setModel(parsedResponse.model)
        }).catch(e => {
            notification.error(`${e}`)
        })
    }

    const isLoading = _.includes([model, series], undefined)


    if (!isLoading && model) {
        return (
            <>
                <MajorContainerView key={model.main.major} source={source} major={model.main} onRelease={() => { onRelease(model.main, model.main.main.sha) }} />
                {model.majors.map(major => {
                    return <MajorContainerView key={major.major} source={source} major={major} onRelease={() => { onRelease(major, major.branch) }} onPatch={() => { onPatch(major, major.branch) }} />
                })}
                {false &&
                    <div><pre>{Codec.toJson(model || {})}</pre></div>
                }
            </>
        )
    } else {
        return (<Row>
            <Col>Loading...</Col>
        </Row>)
    }
}
