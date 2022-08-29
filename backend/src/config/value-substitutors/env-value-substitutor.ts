import { ValueSubstitutor } from "../value-substitutor";

export class EnvValueSubstitutor implements ValueSubstitutor {
    readonly name: string = "env";
    value(value: string): Promise<string> {
        return Promise.resolve(process.env[value]).then(result => {
            if (result) {
                return result
            } else {
                throw new Error(`Unknown value in ENV: ${value}.`)
            }
        })
    }
}