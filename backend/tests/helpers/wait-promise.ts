export const createWait = <T>(timeout: number, success: boolean = true, value: any = null) => {
    return new Promise<T>((resolve, reject) => {
        setTimeout(() => {
            if (success) {
                resolve(value)
            } else {
                reject(value)
            }
        }, timeout)
    })
}  