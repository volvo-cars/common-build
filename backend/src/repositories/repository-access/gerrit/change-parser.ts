import _ from "lodash"
import { createLogger, loggerName } from "../../../logging/logging-factory"

export interface GerritChange {
    changeNumber: number,
    patchSetNumber: number | string
}

const logger = createLogger(loggerName(__filename))

export const parseChange = (string: string): GerritChange | null => {
    const [changeNumberStr, patchSetNumberStr] = _.takeRight(string.split("/"), 2)
    const changeNumber = parseInt(changeNumberStr)
    if (!isNaN(changeNumber)) {
        return {
            changeNumber: changeNumber,
            patchSetNumber: parseInt(patchSetNumberStr) || (patchSetNumberStr === "0" ? 0 : patchSetNumberStr)
        }
    } else {
        return null
    }
}