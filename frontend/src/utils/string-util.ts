
const replacer = /\{(.*?)\}/gm

export const encodeReplace = (input: string): string => {
    return input.replace(replacer, (full, encode) => {
        return encodeURIComponent(encode)
    })
}

const splitter = /\s+|,/
export const splitAndFilter = (input: string): string[] => {
    return input.split(splitter).map(s => { return s.trim() }).filter(s => { return s.length > 0 })
}

export const chopString = (input: string, maxLength: number): string => {
    if (!input) {
        return ""
    }
    if (input.length <= maxLength) {
        return input
    } else {
        return `${input.substring(0, maxLength)}...`
    }
}