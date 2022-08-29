import _ from "lodash";
import { Col, Row } from "react-bootstrap";
import { CtrlBoolean } from "../../forms/ctrl-boolean";
import { RepositoryConfig } from "../../domain-model/system-config/repository-config";
import { Majors } from "../../domain-model/system-config/majors";
import { CtrlSelect } from "../../forms/ctrl-select";
type Props = {
    series: Majors.Serie[],
    config: RepositoryConfig.MajorSerie | undefined,
    onChange: (model: RepositoryConfig.MajorSerie | undefined) => void
}

export const MajorSerieEdit = ({ series, config, onChange }: Props) => {
    const onActiveChange = (newValue: boolean) => {
        if (newValue) {
            const defaultSerie = _.first(series)
            if (defaultSerie) {
                onChange({
                    id: defaultSerie.id,
                    autoApply: true
                })
            }
        } else {
            onChange(undefined)
        }
    }
    const onSerieChange = (serie: Majors.Serie): void => {
        if (config) {
            const clonedConfig = _.cloneDeep(config)
            clonedConfig.id = serie.id
            onChange(clonedConfig)
        }
    }
    const onAutoApplyChange = (newValue: boolean) => {
        if (config) {
            const clonedConfig = _.cloneDeep(config)
            clonedConfig.autoApply = newValue
            onChange(clonedConfig)
        }
    }
    const selectedSerie = series.find(s => { return s.id === config?.id })

    return (
        <>
            <Row>
                <Col xs={{ span: 9, offset: 3 }}>
                    <Row className="align-items-center">
                        <Col xs={3}>
                            Active
                        </Col>
                        <Col xs={9}>
                            <CtrlBoolean value={config ? true : false} onChange={(newValue) => { onActiveChange(newValue) }} />
                        </Col>
                    </Row>
                    {config &&
                        <>
                            <Row className="align-items-center">
                                <Col xs={3}>
                                    Serie
                                </Col>
                                <Col xs={9}>
                                    <CtrlSelect<Majors.Serie> selected={selectedSerie} options={series} onChange={onSerieChange} transformLabel={(serie) => { return serie.id }} />
                                </Col>
                            </Row>
                            <Row className="align-items-center">
                                <Col xs={3}>
                                    Auto apply
                                </Col>
                                <Col xs={9}>
                                    <CtrlBoolean value={config.autoApply} onChange={(newValue) => { onAutoApplyChange(newValue) }} />
                                </Col>
                            </Row>
                        </>
                    }
                </Col>
            </Row>
        </>
    )
}