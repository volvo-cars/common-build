import _ from 'lodash'
import replaceAsync from "string-replace-async"

export interface ValueSubstitutor {
    readonly name: string
    value(name: string): Promise<string>
}

export class Substitutor {

    private static matcher = /\$\{([\w]+):(.+?)\}/gm

    constructor(private substitutors: ValueSubstitutor[]) { }

    /**
     * Traverses an object and replaces string text-markers with substitutor lookup values.
     * @param input the object to traverse for string occurances of ${substitutor:value}
     * @returns 
     */
    async substitute(input: object): Promise<object> {
        const visit = async (value: any): Promise<any> => {
            if (typeof (value) === "string") {
                return this.replaceString(value)
            } else if (Array.isArray(value)) {
                return Promise.all((<any[]>value).map(v => { return visit(v) }))
            } else if (typeof (value) === "object") {
                let o = (<object>value)
                let processed = await Promise.all(_.map(o, (v, k) => {
                    return visit(v).then(processedVaule => {
                        return [k, processedVaule]
                    })
                }))
                return Promise.resolve(_.reduce(processed, (result: any, [k, v]) => {
                    result[k] = v
                    return result
                }, {}))
            } else {
                return Promise.resolve(value)
            }
        }
        return visit(input)
    }

    private async replaceString(input: string): Promise<string> {
        return replaceAsync(input, Substitutor.matcher, async (x, name, value): Promise<string> => {

            let substitutor = _.find(this.substitutors, (s) => { return s.name === name })
            if (substitutor) {
                return substitutor.value(value)
            } else {
                throw new Error(`Unknown substitutor: ${name}`)
            }
        });

    }
}