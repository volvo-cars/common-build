import process from 'process'

export class Env {
    private constructor() { }

    static getRequiredString(name: string): string {
        let value = Env.getOptionalString(name)
        value = value ? value.trim() : value
        if (!value) {
            throw new Error(`Required environment variable '${name}' is missing.`)
        }
        return value
    }

    static getOptionalString(name: string): string | undefined {
        return process.env[name]
    }

}