import fs from 'fs';
import _, { random } from 'lodash';
import { SimpleGit } from "simple-git";
import { Refs } from "../domain-model/refs";
import { createLogger, loggerName } from "../logging/logging-factory";
import { GitOutputParser } from "./git-output-parsers";
import { GitFunction, GitOpContext } from "./local-git-factory";

const logger = createLogger(loggerName(__filename))

export namespace LocalGitCommands {

    const isSpecialNamespace = (ref: Refs.BranchRef): boolean => {
        return _.includes(["meta"], _.first(ref.name.split("/")))
    }

    export class Content {
        constructor(public readonly path: string, public readonly data?: string) { }
    }

    export const getBranchesAndTags = (): GitFunction<(Refs.Branch | Refs.Tag)[]> => {
        return (git: SimpleGit, context: GitOpContext) => {
            return git.raw(['show-ref', '--dereference']).then(output => {
                return GitOutputParser.parseReferences(output)
            })
        }
    }
    export const getFile = (path: string, ref: Refs.Ref): GitFunction<string | null> => {
        return (git: SimpleGit, context: GitOpContext) => {
            //const refName = ref.type === Refs.Type.BRANCH ? `origin/${ref.name}` : ref.name

            return git.show(`${ref.originRef()}:${path}`).then(content => {
                return content
            }).catch(e => {
                return null
            })
        }
    }

    export const updateBranch = (ref: Refs.BranchRef, contents: Content[], fromSha?: Refs.ShaRef): GitFunction<any> => {
        return (git: SimpleGit, context: GitOpContext) => {
            const tempLocalBranch = `${ref.name}_${(new Date().getTime())}_${random(0, 1000000000, false)}`
            const checkoutPoint = fromSha ? fromSha.originRef() : ref.originRef()
            return git.raw(["checkout", "-b", tempLocalBranch, checkoutPoint]).catch((e) => {
                logger.info(`Could not checkout from ${checkoutPoint} (${e}). Checking out orphan.`)
                return git.raw(["checkout", "--orphan", tempLocalBranch])
            }).then(() => {
                return Promise.all(contents.map(content => {
                    const fullPath = `${context.baseDir}/${content.path}`
                    if (content.data === undefined) {
                        return new Promise<void>((resolve, reject) => {
                            fs.unlink(fullPath, (err) => {
                                if (err) {
                                    reject(err)
                                } else {
                                    resolve()
                                }
                            })
                        }).then(() => {
                            git.add(fullPath)
                        })
                    } else {
                        const parentDir = _.initial(fullPath.split('/')).join("/")
                        return (fs.existsSync(parentDir) ? Promise.resolve() : new Promise<void>((resolve, reject) => {
                            fs.mkdir(parentDir, { recursive: true }, (err) => {
                                if (err) {
                                    reject(err)
                                } else {
                                    resolve()
                                }
                            })
                        })).then(() => {
                            return new Promise<void>((resolve, reject) => {
                                fs.writeFile(fullPath, content.data || "", (err) => {
                                    if (err) {
                                        reject(err)
                                    } else {
                                        resolve()
                                    }
                                })
                            }).then(() => {
                                return git.add(fullPath)
                            })
                        })
                    }
                }))
            }).then(() => {
                logger.debug(`Writing to ${context.source}/${ref.name}: ${contents.map(c => { return c.path }).join(" ")}`)
                contents.forEach(f => {
                    console.log(f.data)
                })
                const pushRef = isSpecialNamespace(ref) ? `refs/${ref.name}` : `${ref.name}`
                return git
                    .commit(`CommonBuild: ${contents.map(c => { return c.path }).join(" ")}`)
                    .raw(['push', 'origin', `HEAD:${pushRef}`])
                    .raw(["checkout", `${ref.originRef()}`])
                    .deleteLocalBranch(tempLocalBranch, true)
            })
        }
    }
}


