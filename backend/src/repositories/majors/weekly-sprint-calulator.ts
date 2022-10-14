import _ from "lodash"
import moment from "moment"

/**
 * Calculates the sprint number for the given date.
 * Format YYWW. 
 * Notes: Some differences from Calender; Week 1 always start in january. (year is toggled +-1 to ensure increasing YYMM always.)
 */
export namespace WeeklySprintCalculator {
    export const calculate = (date: Date): number => {
        const m = moment(date)
        const year = m.year()
        const week = m.isoWeek()
        const month = m.month()

        //If week 52 is jan -> year-1. If week 1 is in dec year+1.
        const realYear = (week >= 52 && month === 0) ? year - 1 : ((week === 1 && month === 11) ? year + 1 : year)
        return parseInt(`${realYear - 2000}${_.padStart(week.toString(), 2, "0")}`)
    }
}