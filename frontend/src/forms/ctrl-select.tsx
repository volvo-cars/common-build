import _ from "lodash"
import { Form } from "react-bootstrap"
import Select from 'react-select'

interface Props<T> {
    selected?: T
    options: T[]
    transformLabel?: (t: T) => string
    onChange: (selected: T) => void
    isLoading?: boolean
    placeholder?: string
    width?: number | string
}

const styles = {
    menu: (base: any) => ({
        ...base,
        width: "max-content",
        minWidth: "100%"
    }),
    option: (css: any) => ({
        ...css,
        width: "max-content",
        minWidth: "100%"
    })
}

export const CtrlSelect = <T,>({ selected, options, transformLabel, onChange, isLoading, placeholder, width }: Props<T>) => {
    const realTransformLabel = transformLabel ? transformLabel : (t: T) => { return t as unknown as string }
    const newStyles = width !== undefined ? Object.assign({}, styles, {
        control: (css: any) => ({
            ...css,
            width: width
        })
    }) : styles

    return (
        <Select
            className="basic-single"
            classNamePrefix="select"
            name="color"
            isSearchable={true}
            isLoading={isLoading ? true : false}
            placeholder={placeholder}
            styles={newStyles}
            options={options.map(s => {
                return {
                    value: s,
                    label: realTransformLabel(s)
                }
            })}
            value={selected ? {
                value: selected,
                label: realTransformLabel(selected)
            } : undefined}
            onChange={(selected) => {
                if (selected) {
                    if (selected.value) {
                        onChange(selected.value)
                    }
                }
            }}
        />)
}