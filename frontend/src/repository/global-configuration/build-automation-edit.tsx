import { useState } from "react";
import { Button, ButtonGroup, Col, Row, Table } from "react-bootstrap";
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
                            {automation.labels.length > 0 &&
                                <Table striped={true}>
                                    <thead>
                                        <tr>
                                            <th>label</th>
                                            <th>action</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {automation.labels.map(l => {
                                            return (
                                                <tr>
                                                    <td>{l.id}</td>
                                                    <td>{l.action}</td>
                                                    <td>
                                                        <ButtonGroup className="float-right">
                                                            <EditIcon style={Styles.Icon} className="me-2" onClick={(e) => { setEditLabel({ label: l.id, action: l.action }) }} />
                                                            <DeleteIcon style={Styles.Icon} onClick={(e) => { onDeleteLabel(l.id) }} />
                                                        </ButtonGroup>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </Table>
                            }
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