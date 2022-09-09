import fs from 'fs';
import _, { random } from 'lodash';
import { SimpleGit } from "simple-git";
import { Refs } from "../domain-model/refs";
import { createLogger, loggerName } from "../logging/logging-factory";
import { Update } from '../system/build-system';
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

    class GetBranchesAndTags implements GitFunction<(Refs.Branch | Refs.Tag)[]> {
        public readonly description = this.constructor.name
        execute(git: SimpleGit, context: GitOpContext): Promise<(Refs.Branch | Refs.Tag)[]> {
            return git.raw(['show-ref', '--dereference']).then(output => {
                return GitOutputParser.parseReferences(output)
            })
        }
        public static CMD = new GetBranchesAndTags()
    }

    export const getBranchesAndTags = (): GitFunction<(Refs.Branch | Refs.Tag)[]> => {
        return GetBranchesAndTags.CMD
    }

    class GetBranch implements GitFunction<Refs.Branch | undefined> {
        public readonly description
        constructor(private name: string) {
            this.description = `${this.constructor.name} ${name}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<Refs.Branch | undefined> {
            return git.raw(['rev-parse', `origin/${this.name}`]).then(output => {
                return Refs.Branch.createWithSha(this.name, Refs.ShaRef.create(output))
            }).catch(e => {
                return undefined
            })
        }
        public static CMD = new GetBranchesAndTags()
    }

    export const getBranch = (name: string): GitFunction<Refs.Branch | undefined> => {
        return new GetBranch(name)
    }


    class GetFile implements GitFunction<string | null> {
        public readonly description
        constructor(private path: string, private ref: Refs.Ref) {
            this.description = `${this.constructor.name}: ${path} ${ref}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<string | null> {
            //const refName = ref.type === Refs.Type.BRANCH ? `origin/${ref.name}` : ref.name
            return git.show(`${this.ref.originRef()}:${this.path}`).then(content => {
                return content
            }).catch(e => {
                return null
            })
        }
    }

    export const getFile = (path: string, ref: Refs.Ref): GitFunction<string | null> => {
        return new GetFile(path, ref)
    }

    class FetchRemotes implements GitFunction<any> {
        public readonly description = this.constructor.name
        execute(git: SimpleGit, context: GitOpContext): Promise<any> {
            return git.raw("gc", "--auto").then(() => {
                return git.fetch({ '--force': null })
            })
        }
        public static CMD = new FetchRemotes()
    }

    export const fetchRemotes = (): GitFunction<any> => {
        return FetchRemotes.CMD
    }

    class FetchUpdate implements GitFunction<string | null> {
        public readonly description
        constructor(private update: Update) {
            this.description = `${this.constructor.name}: ${update.changeNumber}/${update.id}`
        }

        execute(git: SimpleGit, context: GitOpContext): Promise<string | null> {
            const ref = `${this.update.changeNumber.toString().slice(-2)}/${this.update.changeNumber}`
            logger.info(`Executing fetch refs/changes/${ref}/*`)
            return git.raw(["fetch", "origin", `refs/changes/${ref}/*:refs/remotes/origin/changes/${ref}/*`, '--no-tags']).then(result => {
                return ""
            })
        }
    }

    export const fetchUpdate = (update: Update): GitFunction<string | null> => {
        return new FetchUpdate(update)
    }

    class UpdateBranch implements GitFunction<any> {
        public readonly description
        constructor(private ref: Refs.BranchRef, private contents: Content[], private fromSha?: Refs.ShaRef) {
            this.description = `${this.constructor.name}: ${ref}${fromSha ? ` from ${fromSha}` : ""} Content count:${contents.length}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<any> {
            const tempLocalBranch = `${this.ref.name}_${(new Date().getTime())}_${random(0, 1000000000, false)}`
            const checkoutPoint = this.fromSha ? this.fromSha.originRef() : this.ref.originRef()
            return git.raw(["checkout", "-b", tempLocalBranch, checkoutPoint]).catch((e) => {
                logger.info(`Could not checkout from ${checkoutPoint} (${e}). Checking out orphan.`)
                return git.raw(["checkout", "--orphan", tempLocalBranch])
            }).then(() => {
                return Promise.all(this.contents.map(content => {
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
                const pushRef = isSpecialNamespace(this.ref) ? `refs/${this.ref.name}` : `${this.ref.name}`
                return git
                    .commit(`CommonBuild: ${this.contents.map(c => { return c.path }).join(" ")}`)
                    .raw(['push', 'origin', `HEAD:${pushRef}`])
                    .raw(["checkout", `${this.ref.originRef()}`])
                    .deleteLocalBranch(tempLocalBranch, true)
            })
        }
    }

    export const updateBranch = (ref: Refs.BranchRef, contents: Content[], fromSha?: Refs.ShaRef): GitFunction<any> => {
        return new UpdateBranch(ref, contents, fromSha)
    }
}


