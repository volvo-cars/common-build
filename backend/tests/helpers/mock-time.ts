import { TimeProvider } from "../../src/system/time"

export class MockTime implements TimeProvider {

    private time: number = 0

    public set(n: number) {
        this.time = n
    }

    public add(n: number) {
        this.time = this.time + n
    }

    public get(): number {
        return this.time
    }

}

export class MockIncrementTime implements TimeProvider {

    private time: number = 0

    public get(): number {
        this.time++
        return this.time
    }

}

