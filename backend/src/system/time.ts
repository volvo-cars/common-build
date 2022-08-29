
export interface Time {
    get(): number
}

export class SystemTime implements Time {
    get(): number {
        return new Date().getTime()
    }
}