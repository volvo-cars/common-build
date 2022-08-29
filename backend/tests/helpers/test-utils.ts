import _ from "lodash"
import { Refs } from "../../src/domain-model/refs"

export namespace TestUtils {
    export const sha = (sha: string): Refs.ShaRef => {
        return Refs.ShaRef.create(sha + _.repeat("0", 40 - sha.length))
    }
}