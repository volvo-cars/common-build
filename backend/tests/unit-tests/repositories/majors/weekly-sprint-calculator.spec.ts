import { describe, expect, it } from '@jest/globals'
import moment from 'moment'
import { WeeklySprintCalculator } from '../../../../src/repositories/majors/weekly-sprint-calulator'


describe("Weekly sprint calculator", () => {

    it("Test date transforms", async () => {
        const testDates: Record<string, number> = {
            "20211227": 2152,
            "20220216": 2207,
            "20220320": 2211,
            "20220321": 2212,
            "20221017": 2242,
            "20230101": 2252,
            "20230102": 2301, //Roll over from 52->1 happens here
            "20230103": 2301,
            "20231231": 2352,
            "20240101": 2401,
            "20280228": 2809,
            "20201228": 2053,
            "20210101": 2053, // Year with 53 weeks
            "20241230": 2501  //Week1 starts in dec.
        }
        Object.keys(testDates).forEach(s => {
            const date = moment(s, "YYYYMMDD").toDate()
            const sprint = WeeklySprintCalculator.calculate(date)
            const expectedSprint = testDates[s]
            expect(sprint).toBe(expectedSprint)
        })
    })

})
