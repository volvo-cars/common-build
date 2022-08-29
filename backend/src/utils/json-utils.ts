
function replacer(key: string, value: any) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}
function reviver(key: string, value: any) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

export class JsonUtils {
    private constructor() { }

    static stringify(input: any, space?: number | undefined): any {
        return JSON.stringify(input, replacer, space)
    }

    static parse(input: string): any {
        return JSON.parse(input, reviver)
    }
}