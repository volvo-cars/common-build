import _ from "lodash"
import { Form } from "react-bootstrap"

interface Props {
    value?: string
    readonly?: boolean
    onChange: (selected: string | undefined) => void
}

export const CtrlInputString = ({ value, readonly, onChange }: Props) => {
    const ops = readonly ? ["readOnly"] : []
    return (
        <Form.Control {...ops} type="text" value={value || ""} onChange={(e: any) => {
            let value = e.target.value
            if (value) {
                value = value.trim()
            }
            onChange(value ? value : undefined)
        }} />
    )
}