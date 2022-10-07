
export interface TimeProvider {
    get(): number
}

export class SystemTime implements TimeProvider {
    get(): number {
        return new Date().getTime()
    }
}