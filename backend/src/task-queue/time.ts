export class Time {
    private constructor(private epochMs: number) { }

    seconds(): number {
        return Math.floor(this.epochMs / 1000)
    }

    milliSeconds(): number {
        return this.epochMs
    }

    addSeconds(seconds: number): Time {
        return new Time(this.epochMs + seconds * 1000)
    }

    addDuration(duration: Duration): Time {
        return new Time(this.epochMs + duration.milliSeconds())
    }

    toDate(): Date {
        return new Date(this.epochMs)
    }

    static now(): Time {
        return new Time(new Date().getTime())
    }
    static fromEpochSeconds(seconds: number): Time {
        return new Time(seconds * 1000)
    }

}

export class Duration {
    private constructor(private milliseconds: number) { }

    seconds(): number {
        return Math.floor(this.milliseconds / 1000)
    }

    milliSeconds(): number {
        return this.milliseconds
    }

    toString(): string {
        return `${this.milliseconds / 1000} secs.`
    }

    add(duration: Duration): Duration {
        return new Duration(this.milliseconds + duration.milliseconds)
    }

    static fromMilliSeconds(milliSeconds: number): Duration {
        return new Duration(milliSeconds)
    }
    static fromSeconds(seconds: number): Duration {
        return new Duration(seconds * 1000)
    }
    static fromMinutes(minutes: number): Duration {
        return new Duration(minutes * 60 * 1000)
    }
    static fromHours(hours: number): Duration {
        return new Duration(hours * 60 * 60 * 1000)
    }
    static fromDays(days: number): Duration {
        return new Duration(days * 24 * 60 * 60 * 1000)
    }

    static NO_DURATION = new Duration(0)
}
