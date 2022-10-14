import fs from 'fs';
import fsExtra from 'fs-extra';
import _ from 'lodash';
import os from 'os';
import simpleGit, { SimpleGit } from 'simple-git';
import { SystemConfig } from "../config/system-config";
import { RepositorySource } from "../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../domain-model/system-config/service-config";
import { createLogger, loggerName } from "../logging/logging-factory";
import { createExecutionSerializer } from "../system/execution-serializer";
import { Duration } from '../task-queue/time';
import { PromiseUtils } from '../utils/promise-utils';
import { VaultService } from "../vault/vault-service";
import { VaultUtils } from "../vault/vault-utils";
import { LocalGitCommands } from './local-git-commands';


export enum LocalGitLoadMode {
    REFRESH = "refresh",
    FETCH = "fetch",
    CACHED = "cached"
}

export interface LocalGitFactory {
    refetch(source: RepositorySource): Promise<void>
    execute<T>(source: RepositorySource, f: GitFunction<T>, loadMode: LocalGitLoadMode): Promise<T>
}

export interface GitOpContext {
    baseDir: string,
    source: RepositorySource
}

const logger = createLogger(loggerName(__filename))

export interface GitFunction<T> {
    description: string
    execute(git: SimpleGit, context: GitOpContext): Promise<T>
}

const Constants = {
    GIT_RETRY_COUNT: 4,
    GIT_RETRY_TIMEOUT: Duration.fromSeconds(3)
}

export class LocalGitFactoryImpl implements LocalGitFactory {


    private executor = createExecutionSerializer()

    constructor(private config: SystemConfig.GitCache, private sources: ServiceConfig.SourceService[], private vaultService: VaultService) { }

    private async executeInternal<T1>(source: RepositorySource, cmd: GitFunction<T1>, loadMode: LocalGitLoadMode): Promise<T1> {
        const sourceConfig = this.sources.find(s => { return s.id === source.id })
        if (sourceConfig) {
            try {

                const getUserAndSecret = (host: string, type: string): Promise<[string, string]> => {
                    return this.vaultService.getSecret(`csp/common-build/${type}-${host}`).then(secret => {
                        return VaultUtils.splitUserSecret(secret)
                    })
                }

                if (!fs.existsSync(this.config.path)) {
                    logger.info(`Creating local-git-cache directory: ${this.config.path}`)
                    fs.mkdirSync(this.config.path, { recursive: true })
                }

                const repositoryPath = [this.config.path, _.concat(source.id, source.path.split("/")).join("_")].join("/")

                let initialized = false
                if (loadMode === LocalGitLoadMode.REFRESH) {
                    fsExtra.emptyDirSync(repositoryPath)
                }
                if (!fs.existsSync(repositoryPath)) {
                    fs.mkdirSync(repositoryPath)
                } else if (!fs.existsSync(`${repositoryPath}/.git`)) {
                    fsExtra.emptyDirSync(repositoryPath)
                } else {
                    initialized = true
                }
                const configuredGitAndOrigin = async (): Promise<[SimpleGit, string]> => {
                    const baseGit = simpleGit(repositoryPath, {
                        binary: 'git',
                        errors: (error, result) => {
                            //We need this special handling. Normal error detection is exitCode>0 + StdError not empty. "git merge-base" has exitCode=1 but empty stdErr => False success.
                            if (error) {
                                return error
                            }
                            if (result.exitCode === 0) {
                                return
                            }
                            return Buffer.concat([...result.stdOut, ...result.stdErr]);
                        },
                    })
                    if (sourceConfig instanceof ServiceConfig.GerritSourceService) {
                        const [user, secret] = await getUserAndSecret(sourceConfig.ssh, "ssh")
                        const keyPath = `${os.homedir()}/ssh-key-${sourceConfig.id}`
                        if (!fs.existsSync(keyPath)) {
                            fs.writeFileSync(keyPath, `${secret}\n`, { mode: 0o600 })
                        }
                        return [
                            baseGit.env("GIT_SSH_COMMAND", `ssh -i ${keyPath} -o LogLevel=ERROR -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`),
                            `ssh://${user}@${sourceConfig.ssh}/${source.path}`
                        ]
                    } else if (sourceConfig instanceof ServiceConfig.GitlabSourceService) {
                        const [user, secret] = await getUserAndSecret(sourceConfig.https, "https")
                        return [baseGit, `https://${user}:${secret}@${sourceConfig.https}`]
                    } else {
                        return Promise.reject(new Error(`Unknown source-config implementation for git: ${sourceConfig.constructor.name}`))
                    }
                }

                const [git, origin] = await configuredGitAndOrigin()
                if (!initialized) {
                    logger.debug(`Initializing ${repositoryPath}`)
                    await git.init()
                        .addRemote("origin", origin)
                        .addConfig("remote.origin.fetch", "+refs/meta/*:refs/remotes/origin/meta/*", true)

                        .addConfig("user.name", this.config.committer.name)
                        .addConfig("user.email", this.config.committer.email)
                }


                const executeCommand = <T>(innerCmd: GitFunction<T>, retryCount: number): Promise<T> => {
                    const startTime = (new Date()).getTime()
                    const secondsPassed = (): number => {
                        return ((new Date()).getTime() - startTime) / 1000
                    }
                    return innerCmd.execute(git, { baseDir: repositoryPath, source: source })
                        .then(result => {
                            logger.debug(`Git ${innerCmd.constructor.name}: ${cmd.description}  (${secondsPassed()} secs) ${source}.`)
                            return result
                        })
                        .catch(e => {
                            logger.warn(`Git failure ${innerCmd.constructor.name}: ${cmd.description} (${secondsPassed()} secs): ${e} on ${source}. Retry counts left: ${retryCount}/${Constants.GIT_RETRY_COUNT}`)
                            if (retryCount > 0) {
                                return PromiseUtils.waitPromise(Constants.GIT_RETRY_TIMEOUT).then(() => {
                                    return executeCommand(innerCmd, retryCount - 1)
                                })
                            } else {
                                return Promise.reject(e)
                            }
                        })
                }
                const runInit = !initialized || loadMode === LocalGitLoadMode.FETCH
                const initializationOp = runInit ? executeCommand(LocalGitCommands.FetchDefaultRemotes.INSTANCE, Constants.GIT_RETRY_COUNT) : Promise.resolve()


                return initializationOp.then(() => {
                    return executeCommand(cmd, Constants.GIT_RETRY_COUNT)
                })
            } catch (e) {
                return Promise.reject(e)
            }
        } else {
            return Promise.reject(new Error(`Repository source: ${source.id} not configured.`))
        }
    }


    execute<T1>(source: RepositorySource, cmd: GitFunction<T1>, loadMode: LocalGitLoadMode): Promise<T1> {
        const serializedCommand = async () => {
            return this.executeInternal(source, cmd, loadMode).catch(e => {
                logger.warn(`Git ${cmd.constructor.name}: ${cmd.description} failed. Retrying with fresh clone for ${source.toString()}`)
                return this.executeInternal(source, cmd, LocalGitLoadMode.REFRESH)
            })
        }
        return this.executor.execute(`local-git-execution:${source.id}:${source.path}`, serializedCommand)
    }

    refetch(source: RepositorySource): Promise<void> {
        return this.execute(source, LocalGitCommands.FetchDefaultRemotes.INSTANCE, LocalGitLoadMode.CACHED)
    }
}

