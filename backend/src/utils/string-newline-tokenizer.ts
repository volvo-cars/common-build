import { assert } from "console"

export const stringNewlineTokenizer = (data: string, callback: (chunk: string) => void): string => {
    assert(data)
    let pos = data.indexOf("\n")
    while (pos >= 0) {
        const event = data.substring(0, pos).trim()
        if (event.length > 0) {
            callback(event)
        }
        data = data.substring(pos + 1)
        pos = data.indexOf("\n")
    }
    return data
}