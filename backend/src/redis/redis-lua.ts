import Redis from "ioredis";

import fs from 'fs';

export namespace RedisLua {

    export interface Invoker {
        invokeScript<T>(name: string, ...args: (string | number | Buffer)[]): Promise<T>
    }

    export class Script {
        constructor(public readonly name: string, public readonly keyCount: number, public readonly source: string) { }

        static fromPath(name: string, keyCount: number, path: string) {
            return new Script(name, keyCount, fs.readFileSync(path).toString())
        }
    }
    class RegisteredScript {
        constructor(public readonly name: string, public readonly keyCount: number, public readonly sha: string) { }
    }

    class InvokerImpl implements Invoker {
        constructor(private registered: Record<string, RegisteredScript>, private redis: Redis, private debug: boolean = false) { }

        invokeScript(name: string, ...args: (string | number | Buffer)[]): Promise<any> {
            const script = this.registered[name]
            if (script) {
                return this.redis.evalsha(script.sha, script.keyCount, ...args).then(result => {
                    if (this.debug) {
                        console.debug(`Redis-LUA debug: ${name}`, "args:", args, "response:", result)
                    }
                    return result
                })
            } else {
                return Promise.reject(new Error(`Script '${name}' is not defined`))
            }
        }
    }

    export const create = (redis: Redis, debug: boolean, ...scripts: Script[]): Promise<Invoker> => {

        return Promise.all(scripts.map(s => {
            return redis.script("LOAD", s.source).then(sha => {
                return new RegisteredScript(s.name, s.keyCount, <string>sha)
            }).catch(e => {
                return Promise.reject(new Error(`Could not create script '${s.name}': ${e}`))
            })
        })).then(registeredScrips => {
            const registered = registeredScrips.reduce((acc, script) => {
                acc[script.name] = script
                return acc
            }, <Record<string, RegisteredScript>>{})
            return new InvokerImpl(registered, redis, debug)
        })

    }
}