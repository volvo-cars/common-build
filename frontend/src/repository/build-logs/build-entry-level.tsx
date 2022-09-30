import { Badge } from "react-bootstrap"
import { BuildLogEvents } from "../../domain-model/buildlog-events/buildlog-events"

type Props = {
    level: BuildLogEvents.Level
}

export const BuildEntryLevel = ({ level }: Props) => {
    let variant = "info"
    let text = "Info"
    if (level === BuildLogEvents.Level.DEBUG) {
        variant = "secondary"
        text = "debug"
    } else if (level === BuildLogEvents.Level.ERROR) {
        variant = "danger"
        text = "Error"
    } else if (level === BuildLogEvents.Level.WARNING) {
        variant = "warning"
        text = "Warning"
    }
    return (
        <Badge bg={variant}>{text}</Badge>
    )
}