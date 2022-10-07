import 'jest'
import { gerritJsonResponseDecode } from '../../../../../src/repositories/repository-access/gerrit/gerrit-json-response-decoder'

describe("Test parsing JSON Gerrit decode", () => {
    it("Parsing successful response", async () => {
        let input = `)]}'
        [{"id":"vcuapps%2Fexample_app~master~I430a4da9ef20368ac5dbbedfa7392a3980883272","project":"vcuapps/example_app","branch":"master","topic":"dodenbra/handle_client_event_errors","attention_set":{"1001139":{"account":{"_account_id":1001139},"last_update":"2022-04-11 15:31:21.000000000","reason":"A robot voted negatively on a label"}},"hashtags":[],"change_id":"I430a4da9ef20368ac5dbbedfa7392a3980883272","subject":"ARTCSP-28227: Add example app for event error handling","status":"NEW","created":"2022-04-11 14:27:37.000000000","updated":"2022-04-12 07:32:20.000000000","submit_type":"REBASE_IF_NECESSARY","mergeable":true,"insertions":836,"deletions":0,"total_comment_count":0,"unresolved_comment_count":0,"has_review_started":true,"meta_rev_id":"0ccf92d0c680ef6bd504ac694e8b58522835dc24","_number":43008,"owner":{"_account_id":1001139},"requirements":[]}]`
        let decoded = gerritJsonResponseDecode(input)
        expect(decoded.length).toBe(1)
        expect(decoded[0].project).toBe("vcuapps/example_app")
    })
})
