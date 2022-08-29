import { useState } from "react";
import { Button, ButtonGroup, Col, Row } from "react-bootstrap";
import { FaRegEdit as EditIcon, FaTrash as DeleteIcon } from 'react-icons/fa';
import { RepositoryConfig } from "../../domain-model/system-config/repository-config";
import { CtrlSelect } from "../../forms/ctrl-select";
import { Styles } from "../../Styles";
import { LabelNameModal } from "./label-name-modal";
type Props = {
    automation: RepositoryConfig.BuildAutomation,
    onChange: (model: RepositoryConfig.BuildAutomation) => void
}

type LabelEdit = {
    label: string | undefined
    action: RepositoryConfig.Action | undefined
}

export const BuildAutomationEdit = ({ automation, onChange }: Props) => {
    const [editLabel, setEditLabel] = useState<LabelEdit | undefined>(undefined)
    const onDefaultActionChange = (newAction: RepositoryConfig.Action): void => {
        automation.default = newAction
        onChange(automation)
    }
    const onUpsertLabel = (label: string, action: RepositoryConfig.Action) => {
        let updated = false
        const newLabel = new RepositoryConfig.LabelAction(label, action)

        automation.labels = automation.labels.map(l => {
            if (l.id === label) {
                updated = true
                return newLabel
            } else {
                return l
            }
        })
        if (!updated) {
            automation.labels.push(newLabel)
        }
        onChange(automation)
    }
    const onDeleteLabel = (label: string) => {
        automation.labels = automation.labels.flatMap(l => {
            if (l.id === label) {
                return []
            } else {
                return [l]
            }
        })
        onChange(automation)
    }

    return (
        <>
            <Row>
                <Col xs={{ span: 9, offset: 3 }}>
                    <Row className="align-items-center">
                        <Col xs={3}>
                            Default action
                        </Col>
                        <Col xs={9}>
                            <CtrlSelect<RepositoryConfig.Action> selected={automation.default} options={Object.values(RepositoryConfig.Action)} onChange={onDefaultActionChange} />
                        </Col>
                    </Row>
                </Col>
            </Row>
            <Row>
                <Col xs={{ span: 9, offset: 3 }}>
                    <Row className="align-items-center">
                        <Col xs={3}>
                            Action by label
                        </Col>
                        <Col xs={9}>
                            {automation.labels.map(l => {
                                return (
                                    <Row key={l.id} className="pb-2">
                                        <Col xs={4}>{l.id}</Col>
                                        <Col xs={3}>{l.action}</Col>
                                        <Col xs={5}>
                                            <ButtonGroup className="float-right">
                                                <EditIcon style={Styles.Icon} className="me-2" onClick={(e) => { setEditLabel({ label: l.id, action: l.action }) }} />
                                                <DeleteIcon style={Styles.Icon} onClick={(e) => { onDeleteLabel(l.id) }} />
                                            </ButtonGroup>
                                        </Col>
                                    </Row>
                                )
                            })}
                            {automation.labels.length === 0 &&
                                <div>No label action defined yet.</div>
                            }
                        </Col>
                    </Row>

                    <Row className="align-items-center">
                        <Col xs={{ span: 9, offset: 3 }} >
                            <Button className="float-right p-0" variant="link" onClick={() => { setEditLabel({ label: undefined, action: undefined }) }}>Create label action</Button>
                        </Col>
                    </Row>
                </Col>
            </Row>
            {editLabel !== undefined &&
                <LabelNameModal label={editLabel.label} action={editLabel.action || RepositoryConfig.Action.Nothing} onCreate={(label, action) => {
                    onUpsertLabel(label, action)
                    setEditLabel(undefined)
                }} onClose={() => { setEditLabel(undefined) }} />
            }
        </>
    )
}