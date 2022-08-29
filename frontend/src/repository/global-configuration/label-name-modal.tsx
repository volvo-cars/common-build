import _ from "lodash";
import { useState } from "react";
import { Button, Col, Modal, Row } from "react-bootstrap";
import { RepositoryConfig } from "../../domain-model/system-config/repository-config";
import { CtrlInputString } from "../../forms/ctrl-input-string";
import { CtrlSelect } from "../../forms/ctrl-select";
type Props = {
    label: string | undefined
    action: RepositoryConfig.Action | undefined
    onCreate: (label: string, action: RepositoryConfig.Action) => void
    onClose: () => void
}

export const LabelNameModal = ({ label, action, onCreate, onClose }: Props) => {
    const [newLabel, setNewLabel] = useState(label)
    const [newAction, setNewAction] = useState(action)
    return (
        <Modal show={true} onHide={() => { onClose() }}>
            <Modal.Header closeButton>
                {label &&
                    <Modal.Title>Edit label action for <strong>{label}</strong></Modal.Title>
                }
                {!label &&
                    <Modal.Title>Create label action</Modal.Title>
                }
            </Modal.Header>

            <Modal.Body>
                <Row>
                    <Col xs={3}>Label</Col>
                    <Col xs={9}><CtrlInputString value={newLabel} readonly={label ? true : false} onChange={(newValue) => { setNewLabel(newValue) }} /></Col>
                </Row>
                <Row>
                    <Col xs={3}>Action</Col>
                    <Col xs={9}><CtrlSelect<RepositoryConfig.Action> selected={newAction} options={Object.values(RepositoryConfig.Action)} onChange={(newValue) => { setNewAction(newValue) }} /></Col>
                </Row>
            </Modal.Body>

            <Modal.Footer>
                <Button disabled={!newLabel || !newAction} variant="primary" onClick={(e) => {
                    if (newLabel && newAction) {
                        onCreate(newLabel, newAction)
                    }
                }}>{label ? "Update" : "Create"}</Button>
            </Modal.Footer>
        </Modal>
    )
}