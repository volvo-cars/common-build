import fs from 'fs';
import fsExtra from 'fs-extra';
import _ from 'lodash';
import os from 'os';
import simpleGit, { SimpleGit } from 'simple-git';
import { SystemConfig } from "../config/system-config";
import { RepositorySource } from "../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../domain-model/system-config/service-config";
import { createLogger, loggerName } from "../logging/logging-factory";
import { RedisFactory } from "../redis/redis-factory";
import { createExecutionSerializer } from "../system/execution-serializer";
import { NodeId } from '../system/node-id';
import { VaultService } from "../vault/vault-service";
import { VaultUtils } from "../vault/vault-utils";
import { LocalGitCommands } from './local-git-commands';


export enum LocalGitLoadMode {
    REFRESH = "refresh",
    FETCH = "fetch",
    CACHED = "cached"
}

export interface LocalGitFactory {
    invalidate(source: RepositorySource): Promise<void>
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

export class LocalGitFactoryImpl implements LocalGitFactory {

    private static GIT_LOCAL_FRESH_TTL = 120 * 60

    private static GIT_RETRY_COUNT = 4

    private static GET_RETRY_TIMEOUT = 3

    private executor = createExecutionSerializer()

    constructor(private config: SystemConfig.GitCache, private sources: ServiceConfig.SourceService[], private vaultService: VaultService, private redisFactory: RedisFactory, private nodeId: NodeId) { }

    execute<T1>(source: RepositorySource, cmd: GitFunction<T1>, loadMode: LocalGitLoadMode): Promise<T1> {
        const sourceConfig = this.sources.find(s => { return s.id === source.id })
        if (sourceConfig) {
            const serializedCommand = async () => {
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
                    if (!fs.existsSync(repositoryPath)) {
                        fs.mkdirSync(repositoryPath)
                    } else if (!fs.existsSync(`${repositoryPath}/.git`)) {
                        fsExtra.emptyDirSync(repositoryPath)
                    } else if (loadMode === LocalGitLoadMode.REFRESH) {
                        fsExtra.emptyDirSync(repositoryPath)
                    } else {
                        initialized = true
                    }

                    const configuredGitAndOrigin = async (): Promise<[SimpleGit, string]> => {
                        const baseGit = simpleGit(repositoryPath, { binary: 'git' })
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
                            .addConfig("remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*")
                            //  .addConfig("remote.origin.fetch", "+refs/changes/*:refs/remotes/origin/changes/*", true)
                            .addConfig("remote.origin.fetch", "+refs/meta/*:refs/remotes/origin/meta/*", true)

                            .addConfig("user.name", this.config.committer.name)
                            .addConfig("user.email", this.config.committer.email)
                            .addConfig("fetch.prune", "true")
                            .addConfig("fetch.pruneTags", "true")
                    }

                    const executeCommand = <T>(cmd: GitFunction<T>, retryCount: number): Promise<T> => {
                        const startTime = (new Date()).getTime()
                        const secondsPassed = (): number => {
                            return ((new Date()).getTime() - startTime) / 1000
                        }
                        return cmd.execute(git, { baseDir: repositoryPath, source: source })
                            .then(result => {
                                logger.debug(`Git ${cmd.description}  (${secondsPassed()} secs) ${source}.`)
                                return result
                            })
                            .catch(e => {
                                logger.warn(`Git failure ${cmd.description} (${secondsPassed()} secs): ${e} on ${source}. Retry counts left: ${retryCount}/${LocalGitFactoryImpl.GIT_RETRY_COUNT}`)
                                if (retryCount > 0) {
                                    const promise = new Promise<T>((resolve, reject) => {
                                        setTimeout(() => {
                                            return executeCommand(cmd, retryCount - 1)
                                                .then(success => {
                                                    resolve(success)
                                                })
                                                .catch(failure => {
                                                    reject(failure)
                                                })
                                        }, LocalGitFactoryImpl.GET_RETRY_TIMEOUT * 1000)
                                    })
                                    return promise
                                } else {
                                    return Promise.reject(e)
                                }
                            })
                    }
                    const redisClient = await this.redisFactory.get()
                    const sourceKey = this.getSourceKey(source)
                    if (!initialized || loadMode === LocalGitLoadMode.FETCH || !(await redisClient.get(sourceKey))) {
                        await executeCommand(LocalGitCommands.fetchRemotes(), LocalGitFactoryImpl.GIT_RETRY_COUNT).then(() => {
                            return redisClient.set(sourceKey, "1", "EX", LocalGitFactoryImpl.GIT_LOCAL_FRESH_TTL)
                        })
                    }
                    return executeCommand(cmd, LocalGitFactoryImpl.GIT_RETRY_COUNT)
                } catch (e) {
                    return Promise.reject(e)
                }
            }
            return this.executor.execute(`local-git-execution:${source.id}:${source.path}`, serializedCommand)
        } else {
            return Promise.reject(new Error(`Repository source: ${source.id} not configured.`))
        }

    }

    private getSourceKey(source: RepositorySource): string {
        return `local-git:fresh:${this.nodeId.id}:${source.id}:${source.path}`
    }

    invalidate(source: RepositorySource): Promise<void> {
        return this.redisFactory.get().then(client => {
            logger.debug(`Invalidating local-git for ${source}`)
            return client.del(this.getSourceKey(source)).then(_ => { return })
        })
    }
}

