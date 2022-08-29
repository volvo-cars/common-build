import { Form } from "react-bootstrap"

type Props = {
    value: boolean,
    labels?: {
        true: string,
        false: string
    },
    onChange: (newValue: boolean) => void
}

export const CtrlBoolean = ({ value, labels, onChange }: Props) => {
    labels = labels || {
        true: "Yes",
        false: "No"
    }
    return (
        <div>
            <Form.Check
                inline
                type="radio"
                label={labels.true}
                checked={value}
                onChange={(e) => { onChange(true) }}
            />
            <Form.Check
                inline
                type="radio"
                label={labels.false}
                checked={!value}
                onChange={(e) => { onChange(false) }}
            />
        </div>
    )
}