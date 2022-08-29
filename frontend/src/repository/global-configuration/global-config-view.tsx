import { AxiosError, AxiosResponse } from "axios"
import _ from "lodash"
import { useEffect, useState } from "react"
import { Button, Col, Row } from 'react-bootstrap'
import { ApiRepository } from "../../domain-model/api/repository"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { Majors } from "../../domain-model/system-config/majors"
import { RepositoryConfig } from "../../domain-model/system-config/repository-config"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
import { BuildAutomationEdit } from "./build-automation-edit"
import { MajorSerieEdit } from "./major-serie-edit"

type BackendResponse = {
    message: string
}

type Props = {
    source: RepositorySource
}


export const GlobalConfigView = ({ source }: Props) => {

    const [config, setConfig] = useState<RepositoryConfig.Config | undefined>()
    const [series, setSeries] = useState<Majors.Serie[] | undefined>()
    const notification = useNotifications()
    useEffect(() => {
        const t = setTimeout(() => {
            setConfig(undefined)
        }, 400)
        Http.createRequest("/api/repository/config", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.SourceRequest(source))).execute().then((response: AxiosResponse<any>) => {
            clearTimeout(t)
            setConfig(Codec.toInstance(response.data, ApiRepository.ConfigResponse).config)
        }).catch((e: AxiosError) => {
            clearTimeout(t)
            if (e.response?.status === 404) {
                setConfig(new RepositoryConfig.Config(
                    new RepositoryConfig.BuildAutomation(RepositoryConfig.Action.Merge, []),
                    undefined
                ))
                notification.warning(`No repository config exists for ${source.path}. Default values provided. Save to configure.`)
            } else {
                notification.error(`${e}`)
            }
        })
    }, [source.id, source.path])
    useEffect(() => {
        Http.createRequest("/api/admin/majors/values").execute().then((response: AxiosResponse<any>) => {
            const series = Codec.toInstance(response.data, ApiRepository.MajorSeriesResponse).series
            setSeries(series)
        })

    }, [])
    const isLoading = _.includes([config, series], undefined)
    const onMajorSerieConfigChanged = (majorConfig: RepositoryConfig.MajorSerie | undefined) => {
        if (config) {
            const clonedConfig = _.cloneDeep(config)
            clonedConfig.majorSerie = majorConfig
            setConfig(clonedConfig)
        }
    }
    const onBuildAutomationChanged = (buildAutomation: RepositoryConfig.BuildAutomation) => {
        if (config) {
            const clonedConfig = _.cloneDeep(config)
            clonedConfig.buildAutomation = buildAutomation
            setConfig(clonedConfig)
        }
    }
    const onSaveConfig = () => {
        if (config) {
            Http.createRequest("/api/repository/config/set", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.SaveConfigRequest(source, config))).execute().then((response: AxiosResponse<any>) => {
                notification.info(Codec.toInstance(response.data, ApiRepository.MessageResponse).message)
            })
        }
    }

    return (
        <>
            <Row>
                <Col xs={12}>
                    {isLoading &&
                        <div>Loading repository...</div>
                    }
                    {(!isLoading && config) &&
                        <>
                            <Row>
                                <Col>
                                    <h6>Major serie</h6>
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <MajorSerieEdit series={series || []} config={config.majorSerie} onChange={onMajorSerieConfigChanged} />
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <h6>Build automation</h6>
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <BuildAutomationEdit automation={config.buildAutomation} onChange={onBuildAutomationChanged} />
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <Button variant="primary" className="float-end" onClick={onSaveConfig}>Update config</Button>
                                </Col>
                            </Row>

                        </>
                    }

                </Col>
            </Row>
        </>)

}



