import _ from "lodash"
import { useState } from "react"
import { Col, Row } from "react-bootstrap"
import { CtrlBoolean } from "../../forms/ctrl-boolean"
import { CtrlSelect } from "../../forms/ctrl-select"
import { CtrlTooltip } from "../../forms/ctrl-tooltip"
type Props = {
    availableSystems: string[],
    activeSystem: string | undefined,
    onChange: (system: string | undefined) => void
}

export const NonDefaultSystem = ({ availableSystems, activeSystem, onChange }: Props) => {
    if (!availableSystems.length) {
        throw new Error(`Can not provide a zero length array for available systems.`)
    }
    const allSystems = _.filter(_.uniq(_.concat(availableSystems, activeSystem)), s => { return s ? true : false }) as string[]
    const [useNonDefault, setUseNonDefault] = useState<boolean>(activeSystem ? true : false)
    const [selectedSystem, setSelectedSystem] = useState<string>(activeSystem || availableSystems[0])

    const onSystemChange = (system: string): void => {
        setSelectedSystem(system)
        onChange(system)
    }
    const onUseNonDefault = (checked: boolean) => {
        if (checked) {
            setUseNonDefault(true)
            onChange(selectedSystem)
        } else {
            setUseNonDefault(false)
            onChange(undefined)
        }
    }


    return (
        <>
            <Row>
                <Col xs={{ span: 9, offset: 3 }}>
                    <Row className="align-items-center">
                        <Col xs={3}>
                            <CtrlTooltip message="If this project should be processed by another system than the default production system. This option is normally used in development to not have a race-condition between production and dev systems.">
                                Use non-default system
                            </CtrlTooltip>
                        </Col>
                        <Col xs={9}>
                            <CtrlBoolean value={useNonDefault} onChange={(newValue) => { onUseNonDefault(newValue) }} />
                        </Col>
                    </Row>
                    {useNonDefault &&
                        <>
                            <Row className="align-items-center">
                                <Col xs={3}>
                                    System
                                </Col>
                                <Col xs={9}>
                                    <CtrlSelect<string> selected={selectedSystem} options={allSystems} onChange={onSystemChange} />
                                </Col>
                            </Row>
                        </>
                    }
                </Col>
            </Row>
        </>
    )
}