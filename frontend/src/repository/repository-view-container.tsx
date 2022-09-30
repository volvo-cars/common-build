import { AxiosResponse } from 'axios'
import { useEffect, useState } from 'react'
import { Col, Row } from 'react-bootstrap'
import { NavLink, Route, Routes, useParams } from "react-router-dom"
import { ApiRepository } from '../domain-model/api/repository'
import { Codec } from '../domain-model/system-config/codec'
import { Http, HttpMethod } from '../utils/http'
import { RepositorySourceUtil } from '../utils/repository-source-util'
import { GlobalConfigView } from './global-configuration/global-config-view'
import { RepositoryState } from './repository-state/repository-state'
import { FaExternalLinkAlt as ExternalIcon } from 'react-icons/fa';
import { Styles } from '../Styles'
import { BuildLogs } from './build-logs/build-logs'
export const RepositoryViewContainer = () => {
    const params = useParams()

    const source = RepositorySourceUtil.deserialize(params.serialized || "")
    let activeStyle = {
        fontWeight: "bold",
    };

    const [buildSystemInfo, setBuildSystemInfo] = useState<ApiRepository.BuildSystemInfo | undefined>()

    useEffect(() => {
        if (source) {
            Http.createRequest("/api/repository/build-config", HttpMethod.POST).setData(new ApiRepository.BuildConfigRequest(source)).execute().then((rawResponse: AxiosResponse<any>) => {
                const response = Codec.toInstance(rawResponse.data, ApiRepository.BuildConfigResponse)
                setBuildSystemInfo(response.buildSystemInfo)
            })
        }
    }, [source?.id, source?.path])

    if (source) {
        return (
            <>
                <Row>
                    <Col>
                        <h4>{source.path}@{source.id}</h4>
                        {buildSystemInfo &&
                            <div style={{ marginBottom: 20 }}>
                                <small>
                                    <a href={buildSystemInfo.buildSystemUrl} target="_blank">{buildSystemInfo.buildSystemName} <ExternalIcon style={Styles.Icon} /></a>
                                </small>
                            </div>
                        }
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <div style={{ paddingTop: 10, marginTop: 10, borderTop: "1px solid #0f7cea" }} />
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <NavLink
                            to="config"
                            style={({ isActive }) => isActive ? activeStyle : {}}
                            className="pe-3"
                        >
                            Configuration
                        </NavLink>
                        <NavLink
                            to="state"
                            style={({ isActive }) => isActive ? activeStyle : {}}
                            className="pe-3"
                        >
                            State
                        </NavLink>
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <Routes>
                            <Route path="config" element={<GlobalConfigView source={source} />} />
                            <Route path="state" element={<RepositoryState source={source} />} />
                            <Route path="logs/:id" element={<BuildLogs source={source} />} />
                        </Routes>
                    </Col>
                </Row>
            </>
        )
    } else {
        return (<Row>
            <Col>Could not decode repository source</Col>
        </Row>)
    }

}