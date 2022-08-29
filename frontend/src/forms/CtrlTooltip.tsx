import { OverlayTrigger, Popover, Tooltip } from "react-bootstrap"

type Props = {
    message: string
}

let counter = 0

export const CtrlTooltip = ({ message, children }: React.PropsWithChildren<Props>) => {
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
                <span>
                    {children}
                </span>
            </OverlayTrigger>
        </>
    )
}