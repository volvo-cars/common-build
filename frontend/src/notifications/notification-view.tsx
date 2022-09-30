import { useContext } from "react";
import { Alert, Col, Container, Row } from "react-bootstrap";
import { CtrlMarkdown } from "../forms/ctrl-markdown";
import NotificationContext, { NotificationType } from "./notification-provider";

export const NotificationView = () => {
    const notification = useContext(NotificationContext)?.notification;
    if (notification) {
        let variant = "info"
        if (notification.type === NotificationType.ERROR) {
            variant = "danger"
        } else if (notification.type === NotificationType.WARNING) {
            variant = "warning"
        }

        return (<div style={{ position: "fixed", bottom: 5, height: 100, opacity: 0.8, width: "100%" }}>
            <Container fluid>
                <Row>
                    <Col className="align-items-center">
                        <Alert variant={variant}><CtrlMarkdown markdown={notification.text} /></Alert>
                    </Col>
                </Row>
            </Container>
        </div>)
    } return (null)

}