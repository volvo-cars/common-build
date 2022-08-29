
const stripper = /^\)\]\}'\s+/m

export const gerritJsonResponseDecode = (body: any): any => {
    if (typeof (body) === "string") {
        let clean = body.replace(stripper, "")
        return JSON.parse(clean)
    } else {
        return body
    }
}