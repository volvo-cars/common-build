import fs from 'fs';
import _, { random } from 'lodash';
import { Options, SimpleGit, SimpleGitTaskCallback, TaskOptions } from "simple-git";
import { Refs } from "../domain-model/refs";
import { createLogger, loggerName } from "../logging/logging-factory";
import { Duration } from '../task-queue/time';
import { PromiseUtils } from '../utils/promise-utils';
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

    export class RefSpec {
        constructor(readonly spec: string) { }
        toString(): string {
            return `refspec:${this.spec}`
        }
    }

    const execRawGit = (git: SimpleGit, context: GitOpContext, cmdLine: string[]): Promise<string> => {
        const cmd = `git ${cmdLine.join(" ")} (${context.source})`
        return git.raw(cmdLine).then(result => {
            //     console.log(`${cmd} -> Success`)
            return result
        }).catch(e => {
            //     console.log(`${cmd} -> Failure`)
            return Promise.reject(e)
        })
    }

    export class Fetch implements GitFunction<void> {
        public readonly description
        constructor(private specs: RefSpec[]) {
            this.description = `Fetch specs ${specs.join(";")}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<void> {
            return execRawGit(git, context, ["fetch", "origin", this.specs.map(s => { return `${s.spec}` })].flat()).then()
        }
    }

    export class FetchPrune implements GitFunction<void> {
        public readonly description
        constructor(private refspec: RefSpec) {
            this.description = `Prune branches and tags for ${refspec}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<void> {
            return execRawGit(git, context, ["fetch", "origin", "--prune", "--prune-tags", `--refmap='${this.refspec.spec}'`]).then()
        }
    }

    export class EntityExists implements GitFunction<boolean> {
        public readonly description
        constructor(private entity: Refs.Entity) {
            this.description = `Ensure entity ${entity}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<boolean> {
            const entity = this.entity
            if (entity instanceof Refs.Branch) {
                return execRawGit(git, context, ["merge-base", "--is-ancestor", entity.sha.sha, entity.ref.originRef]).then(() => {
                    return true
                }).catch(e => {
                    return false
                })
            } else if (entity instanceof Refs.Tag) {
                return execRawGit(git, context, ["rev-list", "-n", "1", entity.ref.originRef]).then(gitSha => {
                    const cleanGitSha = gitSha.trim()
                    if (entity.sha.sha === cleanGitSha) {
                        return true
                    } else {
                        logger.warn(`The tag ${entity.ref} was requested to point to ${entity.sha.sha} but existed and points to ${gitSha}.`)
                        return false
                    }
                }).catch(e => {
                    return false
                })
            } else {
                return Promise.reject(new Error(`Unknown entity-type: ${entity.constructor.name}`))
            }
        }
    }

    export class RefExists implements GitFunction<boolean> {
        public readonly description
        constructor(private ref: Refs.Ref) {
            this.description = `Ensure ref ${ref}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<boolean> {
            const ref = this.ref
            return execRawGit(git, context, ["cat-file", "-t", ref.originRef]).then(gitType => {
                const cleanRef = gitType.trim()
                if (ref instanceof Refs.ShaRef) {
                    return cleanRef === "commit"
                } else if (ref instanceof Refs.TagRef) {
                    return cleanRef === "tag"
                } else if (ref instanceof Refs.BranchRef) {
                    return cleanRef === "commit"
                } else {
                    return Promise.reject(new Error(`Unxpected ref-typ: ${ref.constructor.name}`))
                }
            }).catch(e => {
                return false
            })
        }
    }

    const EnsureConstants = {
        PRE_WAIT: Duration.NO_DURATION,
        RETRY_WAIT: Duration.fromSeconds(3),
        RETRY_COUNT: 3
    }
    export enum EnsureResult {
        NO_ACTION = "no_action",
        UPDATED = "updated",
        NOT_FOUND = "not_found"
    }

    export class MacroEnsureRefDeleted implements GitFunction<EnsureResult> {
        readonly description: string
        constructor(private ref: Refs.Ref, private refspec: RefSpec) {
            this.description = `Ensure ${ref} is deleted (${refspec})`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<EnsureResult> {
            const execute = (retriesLeft: number): Promise<EnsureResult> => {
                if (retriesLeft > 0) {
                    return new RefExists(this.ref).execute(git, context).then(exists => {
                        if (!exists) {
                            return retriesLeft === EnsureConstants.RETRY_COUNT ? EnsureResult.NO_ACTION : EnsureResult.UPDATED
                        } else {
                            return PromiseUtils.waitPromise(EnsureConstants.RETRY_WAIT).then(() => {
                                return new FetchPrune(this.refspec).execute(git, context).then(() => {
                                    return execute(retriesLeft - 1)
                                })
                            })
                        }
                    })
                } else {
                    return Promise.resolve(EnsureResult.NOT_FOUND)
                }
            }
            return PromiseUtils.waitPromise(EnsureConstants.PRE_WAIT).then(() => {
                return execute(EnsureConstants.RETRY_COUNT)
            })
        }
    }

    export class MacroEnsureEntityExists implements GitFunction<EnsureResult> {
        readonly description: string
        constructor(private entity: Refs.Entity, private refspec: RefSpec) {
            this.description = `Ensure ${entity} exists (${refspec})`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<EnsureResult> {
            const execute = (retriesLeft: number): Promise<EnsureResult> => {
                if (retriesLeft > 0) {
                    return new EntityExists(this.entity).execute(git, context).then(exists => {
                        if (exists) {
                            return retriesLeft === EnsureConstants.RETRY_COUNT ? EnsureResult.NO_ACTION : EnsureResult.UPDATED
                        } else {
                            return PromiseUtils.waitPromise(EnsureConstants.RETRY_WAIT).then(() => {
                                return new Fetch([this.refspec]).execute(git, context).then(() => {
                                    return execute(retriesLeft - 1)
                                })
                            })
                        }
                    })
                } else {
                    return Promise.resolve(EnsureResult.NOT_FOUND)
                }
            }
            return PromiseUtils.waitPromise(EnsureConstants.PRE_WAIT).then(() => {
                return execute(EnsureConstants.RETRY_COUNT)
            })
        }
    }

    export class MacroEnsureRefExists implements GitFunction<EnsureResult> {
        readonly description: string
        constructor(private ref: Refs.Ref, private refspec: RefSpec) {
            this.description = `Ensure ${ref} exists (${refspec})`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<EnsureResult> {
            const execute = (retriesLeft: number): Promise<EnsureResult> => {
                if (retriesLeft > 0) {
                    return new RefExists(this.ref).execute(git, context).then(exists => {
                        if (exists) {
                            return retriesLeft === EnsureConstants.RETRY_COUNT ? EnsureResult.NO_ACTION : EnsureResult.UPDATED
                        } else {
                            return PromiseUtils.waitPromise(EnsureConstants.RETRY_WAIT).then(() => {
                                return new Fetch([this.refspec]).execute(git, context).then(() => {
                                    return execute(retriesLeft - 1)
                                })
                            })
                        }
                    })
                } else {
                    return Promise.resolve(EnsureResult.NOT_FOUND)
                }
            }
            return PromiseUtils.waitPromise(EnsureConstants.PRE_WAIT).then(() => {
                return execute(EnsureConstants.RETRY_COUNT)
            })
        }
    }

    export class FetchDefaultRemotes implements GitFunction<void> {
        public static readonly INSTANCE: FetchDefaultRemotes = new FetchDefaultRemotes()
        public readonly description = ""
        execute(git: SimpleGit, context: GitOpContext): Promise<void> {
            return git.fetch("origin").then(fetchResult => {
                return Promise.resolve()
            })
        }
    }


    class GetBranchesAndTags implements GitFunction<Refs.Entity[]> {
        public readonly description = ""
        execute(git: SimpleGit, context: GitOpContext): Promise<Refs.Entity[]> {
            return execRawGit(git, context, ['show-ref', '--dereference']).then(output => {
                const references = GitOutputParser.parseReferences(output)
                return references
            })
        }
        public static CMD = new GetBranchesAndTags()
    }

    export const getBranchesAndTags = (): GitFunction<Refs.Entity[]> => {
        return GetBranchesAndTags.CMD
    }

    class GetBranch implements GitFunction<Refs.Branch | undefined> {
        public readonly description
        constructor(private name: string) {
            this.description = name
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<Refs.Branch | undefined> {
            return execRawGit(git, context, ['rev-parse', `origin/${this.name}`]).then(output => {
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
            this.description = `${path} ${ref}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<string | null> {
            return git.show(`${this.ref.originRef}:${this.path}`).then(content => {
                return content
            }).catch(e => {
                return null
            })
        }
    }

    export const getFile = (path: string, ref: Refs.Ref): GitFunction<string | null> => {
        return new GetFile(path, ref)
    }

    const CommitFieldSeparator = "[_-\|/-_]"

    class GetCommits implements GitFunction<GitCommit[]> {
        private range: string
        public readonly description: string
        constructor(private to: Refs.Ref, private from: Refs.Ref | undefined, private maxCount: number) {
            this.range = _.concat([[this.to.originRef], this.from ? [this.from.originRef] : []]).flat().join("...")
            this.description = `${this.range}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<GitCommit[]> {

            return git.env("GIT_PAGER", "cat").raw("log", this.range, `--pretty=%H${CommitFieldSeparator}%cn${CommitFieldSeparator}%ct${CommitFieldSeparator}%s`, "--max-count", this.maxCount.toString()).then(output => {
                return <GitCommit[]>output.split("\n").map(s => {
                    return GitCommit.parse(s)
                }).filter(c => { return c ? true : false })
            })
        }
    }

    export class GitCommit {
        constructor(public readonly sha: string, public readonly commiter: string, public readonly timestamp: number, public readonly message: string) { }
        static parse(string: string): GitCommit | undefined {
            const parts = string.split(CommitFieldSeparator)
            if (parts.length === 4) {
                return new GitCommit(parts[0], parts[1], parseInt(parts[2]), parts[3])
            }
        }
    }

    export const getCommits = (to: Refs.Ref, from: Refs.Ref | undefined, maxCount: number): GitFunction<GitCommit[]> => {
        return new GetCommits(to, from, maxCount)
    }




    class UpdateBranch implements GitFunction<any> {
        public readonly description

        constructor(private ref: Refs.BranchRef, private contents: Content[], private fromSha?: Refs.ShaRef) {
            this.description = `${ref}${fromSha ? ` from ${fromSha}` : ""} Content count:${contents.length}`
        }
        execute(git: SimpleGit, context: GitOpContext): Promise<any> {
            const tempLocalBranch = `${this.ref.name}_${(new Date().getTime())}_${random(0, 1000000000, false)}`
            const checkoutPoint = this.fromSha ? this.fromSha.originRef : this.ref.originRef
            return execRawGit(git, context, ["checkout", "-b", tempLocalBranch, checkoutPoint]).catch((e) => {
                logger.info(`Could not checkout from ${checkoutPoint} (${e}). Checking out orphan.`)
                return execRawGit(git, context, ["checkout", "--orphan", tempLocalBranch])
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
                    .raw(["checkout", `${this.ref.originRef}`])
                    .deleteLocalBranch(tempLocalBranch, true)
            })
        }
    }

    export const updateBranch = (ref: Refs.BranchRef, contents: Content[], fromSha?: Refs.ShaRef): GitFunction<any> => {
        return new UpdateBranch(ref, contents, fromSha)
    }
}


