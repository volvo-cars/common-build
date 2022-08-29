import { readFileSync } from "fs";
import { ValueSubstitutor } from "../value-substitutor";

export class FileValueSubstitutor implements ValueSubstitutor {
    readonly name: string = "file";
    value(value: string): Promise<string> {
        return Promise.resolve(readFileSync(value).toString("utf-8"))
    }
}