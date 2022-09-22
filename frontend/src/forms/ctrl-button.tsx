import { Button as BootstrapButton } from "react-bootstrap"
import { CtrlTooltip } from "./ctrl-tooltip"

export namespace CtrlButton {
    type Props = {
        onClick: () => void
        config?: Config
        size?: "sm" | "lg" | "md"
        variant?: "primary" | "secondary"
    }

    export interface Config {
        isDisabled?: boolean
        toolTip?: string
        hideIcon?: boolean
    }

    const DEFAULTS = {
        HIDE_ICON: false,
        TOOLTIP: undefined,
        IS_DISABLED: false,
        SIZE: "md",
        VARIANT: "primary"
    }

    export const Button = ({ onClick, config, size, variant, children }: React.PropsWithChildren<Props>) => {
        const { isDisabled, toolTip, hideIcon } = ((c: Config) => {
            return {
                isDisabled: c.isDisabled ?? DEFAULTS.IS_DISABLED,
                toolTip: c.toolTip ?? DEFAULTS.TOOLTIP,
                hideIcon: c.hideIcon ?? DEFAULTS.HIDE_ICON
            }
        })(config || {})

        const attributes = isDisabled ? { "disabled": true } : {}
        const button = (<BootstrapButton {...attributes} className={`btn-${size || DEFAULTS.SIZE}`} variant={variant || DEFAULTS.VARIANT} onClick={onClick}>{children}</BootstrapButton>)
        if (toolTip) {
            return (
                <CtrlTooltip message={toolTip} hideIcon={hideIcon}>
                    {button}
                </CtrlTooltip>
            )
        } else {
            return button
        }
    }
}





