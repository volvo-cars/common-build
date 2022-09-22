import { AxiosError, AxiosResponse } from "axios"
import _ from "lodash"
import { useEffect, useState } from "react"
import { Col, Row } from "react-bootstrap"
import { ApiRepository } from "../../domain-model/api/repository"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { Majors } from "../../domain-model/system-config/majors"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
import { ReleaseWindow } from "./release-window"
import { RepositoryModelView } from "./repository-model-view"
type Props = {
    source: RepositorySource
}

export const RepositoryState = ({ source }: Props) => {
    const [model, setModel] = useState<RepositoryModel.Root | undefined>(undefined)
    const [series, setSeries] = useState<Majors.Serie[] | undefined>(undefined)
    const [commits, setCommits] = useState<{ commits: ApiRepository.Commit[], major: RepositoryModel.TopContainer } | undefined>(undefined)
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
        }).catch((e: AxiosError) => {
            notification.error(`${e.response?.status}: ${e.response?.statusText}`)
        })

    }, [])
    const onRelease = (major: RepositoryModel.TopContainer, viewSha: string) => {
        Http.createRequest("/api/repository/unreleased-commits", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.UnreleasedCommitsRequest(source, major.major))).execute().then((response: AxiosResponse<any>) => {
            const parsedResponse = Codec.toInstance(response.data, ApiRepository.UnreleasedCommitsResponse)
            setCommits({
                commits: parsedResponse.commits,
                major: major
            })

        }).catch((e: AxiosError) => {
            notification.error(`${e.response?.status}:${e.response?.statusText}`)
        })
    }

    const onPatch = (major: RepositoryModel.TopContainer) => {
        Http.createRequest("/api/repository/patch", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.CreatePatchBranchRequest(source, major.major))).execute().then((response: AxiosResponse<any>) => {
            const parsedResponse = Codec.toInstance(response.data, ApiRepository.CreatePatchBranchResponse)
            notification.info(parsedResponse.message)
            setModel(parsedResponse.model)
        }).catch((e: AxiosError) => {
            notification.error(`${e.response?.status}:${e.response?.statusText}`)
        })
    }

    const isLoading = _.includes([model, series], undefined)


    if (!isLoading && model) {
        return (
            <>
                {commits &&
                    <ReleaseWindow commits={commits.commits} major={commits.major} onRelease={(commit => {
                        if (!commit) {
                            setCommits(undefined)
                        } else {
                            Http.createRequest("/api/repository/release", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.ReleaseRequest(source, commits.major.major, commit.sha))).execute().then((response: AxiosResponse<any>) => {
                                const parsedResponse = Codec.toInstance(response.data, ApiRepository.ReleaseResponse)
                                notification.info(parsedResponse.message)
                                setModel(parsedResponse.model)
                                setCommits(undefined)
                            }).catch((e: AxiosError) => {
                                notification.error(`${e.response?.status}: ${e.response?.statusText}`)
                            })
                        }
                    })} />
                }
                <RepositoryModelView model={model} onPatch={onPatch} onRelease={onRelease} source={source} />
            </>
        )
    } else {
        return (<Row>
            <Col>Loading...</Col>
        </Row>)
    }
}
