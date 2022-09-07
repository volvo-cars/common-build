export class Time {
    private constructor(private time: number) { }

    seconds(): number {
        return Math.floor(this.time)
    }

    milliSeconds(): number {
        return this.time
    }

    addSeconds(seconds: number): Time {
        return new Time(this.time + seconds * 1000)
    }

    addDuration(duration: Duration): Time {
        return new Time(this.time + duration.milliSeconds())
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

    static fromMilliSeconds(milliSeconds: number): Duration {
        return new Duration(milliSeconds)
    }
    static fromSeconds(seconds: number): Duration {
        return new Duration(seconds * 1000)
    }

    static NO_DURATION = new Duration(0)
}
