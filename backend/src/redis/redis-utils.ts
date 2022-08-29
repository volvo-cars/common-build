import _ from 'lodash'
import { ChainableCommander } from "ioredis/built/utils/RedisCommander"
export class RedisUtils {
    private constructor() { }
    static async executeMulti(multi: ChainableCommander): Promise<any[]> {
        return multi.exec().then(result => {
            if (result) {
                const errorIndex = _.findIndex(result, (entry => {
                    return entry[0] ? true : false
                }))
                if (errorIndex >= 0) {
                    return Promise.reject(new Error(`RedisError (op-index:${errorIndex}): ${result[errorIndex][0]}`))
                } else {
                    return Promise.resolve(result.map(entry => { return entry[1] }))
                }
            } else {
                return Promise.resolve([])
            }
        })
    }
}