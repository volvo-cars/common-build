export namespace ProcessingStates {


    export abstract class JobState {

        constructor(public failureCount: number) { }

        protected abstract constructorArgs(): any[]

        serialize(): string {
            return this.constructor.name + ":" + JSON.stringify(this.constructorArgs())
        }

        abstract withNewFailure(): JobState

        static deserialize(string: string): JobState {
            const pos = string.indexOf(":")
            const className = string.substring(0, pos)
            const args = <any[]>JSON.parse(string.substring(pos + 1))
            return new ((<any>ProcessingStates)[className])(...args)
        }
    }

    export class JobStarting extends JobState {

        constructor(public readonly productId: string, failureCount: number) {
            super(failureCount)
        }

        protected constructorArgs(): any[] {
            return [this.productId, this.failureCount]
        }

        withNewFailure(): JobStarting {
            return new JobStarting(this.productId, this.failureCount + 1)
        }

    }

    export class JobStarted extends JobState {
        constructor(public readonly productId: string, public readonly activityId: string, failureCount: number) {
            super(failureCount)
        }

        protected constructorArgs(): any[] {
            return [this.productId, this.activityId, this.failureCount]
        }


        withNewFailure(): JobStarted {
            return new JobStarted(this.productId, this.activityId, this.failureCount + 1)
        }
    }

    export class JobQueued extends JobState {
        constructor(failureCount: number) {
            super(failureCount)
        }
        protected constructorArgs(): any[] {
            return [this.failureCount]
        }
        withNewFailure(): JobQueued {
            return new JobQueued(this.failureCount + 1)
        }
    }

    export class JobAbort extends JobState {
        public reason: string
        constructor(reason: string) {
            super(0)
            this.reason = reason
        }
        protected constructorArgs(): any[] {
            return [this.reason]
        }
        withNewFailure(): JobAbort {
            return new JobAbort(this.reason)
        }
    }

}