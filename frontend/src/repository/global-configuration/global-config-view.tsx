import { AxiosError, AxiosResponse } from "axios"
import _ from "lodash"
import { useEffect, useState } from "react"
import { Button, Col, Row } from 'react-bootstrap'
import { ApiRepository } from "../../domain-model/api/repository"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { Majors } from "../../domain-model/system-config/majors"
import { RepositoryConfig } from "../../domain-model/system-config/repository-config"
import { CtrlBoolean } from "../../forms/ctrl-boolean"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
import { BuildAutomationEdit } from "./build-automation-edit"
import { MajorSerieEdit } from "./major-serie-edit"
import { NonDefaultSystem } from "./non-default-system"

type BackendResponse = {
    message: string
}

type Props = {
    source: RepositorySource
}


export const GlobalConfigView = ({ source }: Props) => {

    const [config, setConfig] = useState<RepositoryConfig.Config | undefined>(undefined)
    const [series, setSeries] = useState<Majors.Serie[] | undefined>(undefined)
    const [availableSystems, setAvailableSystems] = useState<string[] | undefined>(undefined)
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
                    undefined,
                    undefined
                ))
                notification.warning(`No repository config exists for ${source.path}. Default values provided. Save to configure.`)
            } else {
                notification.error(`${e}`)
            }
        })
    }, [source.id, source.path])
    useEffect(() => {
        Http.createRequest("/api/admin/config-values").execute().then((response: AxiosResponse<any>) => {
            const configValues = Codec.toInstance(response.data, ApiRepository.ConfigValuesResponse)
            setSeries(configValues.series)
            setAvailableSystems(configValues.availableSystems)
        })

    }, [])
    const isLoading = _.includes([config, series, availableSystems], undefined)
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

    const onNonDefaultSystemChanged = (system: string | undefined) => {
        if (config) {
            const clonedConfig = _.cloneDeep(config)
            clonedConfig.activeSystem = system
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
                    {(!isLoading && config && availableSystems) &&
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
                                    <h6>Other configurations</h6>
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <NonDefaultSystem availableSystems={availableSystems} activeSystem={config.activeSystem} onChange={onNonDefaultSystemChanged} />
                                </Col>
                            </Row>
                            <Row style={{ paddingTop: 20 }}>
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



