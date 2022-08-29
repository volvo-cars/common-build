import { Col, Row } from 'react-bootstrap'
import { NavLink, Route, Routes, useParams } from "react-router-dom"
import { RepositorySourceUtil } from '../utils/repository-source-util'
import { GlobalConfigView } from './global-configuration/global-config-view'
import { RepositoryState } from './repository-state/repository-state'

export const RepositoryViewContainer = () => {
    const params = useParams()

    const source = RepositorySourceUtil.deserialize(params.serialized || "")
    let activeStyle = {
        fontWeight: "bold",
    };

    console.log(source)
    if (source) {
        return (
            <>
                <Row>
                    <Col>
                        <h3>{source.path}
                            <div><small>{source.id}</small></div>
                        </h3>
                    </Col>
                </Row>
                <Row className="gx-5 mb-2">
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