import _ from "lodash"
import Showdown from "showdown"

type Props = {
    millseconds: number
}


export const CtrlDuration = ({ millseconds }: Props) => {
    const totalSeconds = millseconds / 1000
    const hours = Math.floor(totalSeconds / (60 * 60))
    const minutes = Math.floor((totalSeconds - hours * 60 * 60) / 60)
    const seconds = Math.floor((totalSeconds - hours * 60 * 60 - minutes * 60))

    const pad = (n: number): string => {
        return _.padStart(n.toString(), 2, "0")
    }
    const array = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds]



    return (<span className="duration">{array.map(n => { return pad(n) }).join(":")}</span>)
}