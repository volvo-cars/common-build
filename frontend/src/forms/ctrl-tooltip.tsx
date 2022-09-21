import { OverlayTrigger, Popover, Tooltip } from "react-bootstrap"
import { MdLiveHelp as HelpIcon } from 'react-icons/md'
import { Styles } from "../Styles"
type Props = {
    message: string,
    hideIcon?: boolean
}

let counter = 0

export const CtrlTooltip = ({ message, hideIcon, children }: React.PropsWithChildren<Props>) => {
    const [p1, p2] = message.split("|")
    counter = (counter + 1) % 1000000
    const placement = "top"
    const popover = (
        <Popover id={`popover_${counter}`}>
            {p2 &&
                <Popover.Header as="h3">{p1}</Popover.Header>
            }
            <Popover.Body>
                <div>{p2 || p1}</div>
            </Popover.Body>
        </Popover>
    )
    return (
        <>
            <OverlayTrigger trigger={['hover', 'focus']} placement={placement} overlay={popover}>

                <span style={{ position: "relative" }}>
                    {children}
                    {!hideIcon &&
                        <div style={{ display: "inline-block", position: "absolute", top: -4, left: -20, margin: 0, padding: 0, border: 0 }} >
                            <HelpIcon style={Object.assign({}, Styles.Icon, { color: "bbb" })} />
                        </div>
                    }
                </span>
            </OverlayTrigger>
        </>
    )
}