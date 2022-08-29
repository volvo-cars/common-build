import _ from "lodash"

export interface Label {
    label: string
    covers(other: Label): boolean
}

class LabelImpl implements Label {

    constructor(public label: string) { }

    covers(other: Label): boolean {
        return other.label.indexOf(this.label) === 0
    }
}

export const extractLabels = (labels: string): Label[] => {
    let parts = labels.split('[\\s,]+')
    return parts.length > 0 ? _.map(parts, (part: string) => { return new LabelImpl(part.trim()) }) : []
}

export const extractFirstLabel = (labels: string): Label | undefined => {
    return _.first(extractLabels(labels))
}

export const coversAll = (requiredLabels: Label[], availableLabels: Label[]): boolean => {
    return _.every(requiredLabels, (required: Label) => {
        return _.find(availableLabels, (available: Label) => {
            return available.covers(required)
        })
    })
}
