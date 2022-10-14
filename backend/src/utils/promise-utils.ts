import { Duration } from "../task-queue/time"

export namespace PromiseUtils {
    export const waitPromise = (duration: Duration): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                resolve()
            }, duration.milliSeconds())
        })
    }

}