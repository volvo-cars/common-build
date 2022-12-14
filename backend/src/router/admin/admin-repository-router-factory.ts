import HttpStatusCodes from 'http-status-codes'
import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import _ from 'lodash'
import rawBody from 'raw-body'
import { Readable } from 'stream'
import { BuildLog } from '../../buildlog/buildlog'
import { CynosureApiConnectorFactory } from '../../cynosure/cynosure-api-connector/cynosure-api-connector-factory'
import { ApiRepository } from "../../domain-model/api/repository"
import { Refs } from '../../domain-model/refs'
import { RepositorySource } from '../../domain-model/repository-model/repository-source'
import { Codec } from "../../domain-model/system-config/codec"
import { LocalGitCommands } from '../../git/local-git-commands'
import { LocalGitFactory, LocalGitLoadMode } from '../../git/local-git-factory'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { Content } from '../../repositories/repository-access/repository-access'
import { RepositoryAccessFactory } from '../../repositories/repository-access/repository-access-factory'
import { VersionType } from '../../repositories/repository/repository'
import { RepositoryFactory } from "../../repositories/repository/repository-factory"
import { SystemFilesAccess } from "../../repositories/system-files-access"
import { BuildSystem } from '../../system/build-system'
import { SourceCache } from '../../system/source-cache'
import { TarUtils } from '../../utils/tar-utils'
import { RouterFactory } from "../router-factory"


const logger = createLogger(loggerName(__filename))

export class AdminRepositoryRouterFactory implements RouterFactory {
    constructor(private systemFilesAccess: SystemFilesAccess, private buildSystem: BuildSystem.Service, private repositoryAccessFactory: RepositoryAccessFactory, private repositoryModelFactory: RepositoryFactory, private cynosureApiConnectorFactory: CynosureApiConnectorFactory, private sourceCache: SourceCache.Service, private buildLogService: BuildLog.Service) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/repository" })
        router.use(koaBodyParser())

        router.post("/model", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.SourceRequest)
            const model = (await this.repositoryModelFactory.get(request.source).modelReader()).model
            ctx.body = Codec.toPlain(new ApiRepository.ModelResponse(model))
        })
        router.post("/build-config", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.BuildConfigRequest)
            const source = request.source
            const connector = this.cynosureApiConnectorFactory.createApiConnector(source.id)
            if (connector) {
                return connector.findProductId(source.path).then(productId => {
                    if (productId) {
                        ctx.body = Codec.toPlain(new ApiRepository.BuildConfigResponse(new ApiRepository.BuildSystemInfo(`https://victoria.volvocars.biz/product/${productId}`, "Cynosure")))
                    } else {
                        ctx.response.status = HttpStatusCodes.NOT_FOUND
                        ctx.body = `Could not find product in Cynosure for ${source}`
                    }
                })
            } else {
                ctx.response.status = HttpStatusCodes.NOT_FOUND
                ctx.body = `Could not find Cynosure connector for source: ${source.id}`
            }
        })
        router.post("/release", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.ReleaseRequest)
            const modelReader = await this.repositoryModelFactory.get(request.source).modelReader()
            const branch = modelReader.findBranch(request.major, undefined) // To include minors after.
            try {
                if (branch) {
                    const version = await this.buildSystem.release(request.source, branch.withSha(request.sha), VersionType.MINOR)
                    const updatedModel = (await this.repositoryModelFactory.get(request.source).modelReader()).model
                    ctx.body = Codec.toPlain(new ApiRepository.ReleaseResponse(updatedModel, `Version ${version.asString()} was released from ${request.sha}.`))
                } else {
                    throw new Error(`Could not find expected branch to release next version of Major ${request.major}.`)
                }
            } catch (e) {
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.response.message = (<Error>e).message
            }
        })
        router.post("/unreleased-commits", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.UnreleasedCommitsRequest)
            const modelReader = await this.repositoryModelFactory.get(request.source).modelReader()
            try {
                const fromVersion = modelReader.highestVersion(request.major)
                const toBranch = modelReader.findBranch(request.major, undefined)
                if (!toBranch) {
                    throw new Error(`Could not find branch for Major ${request.major}.`)
                }
                const MAX_COMMIT_COUNT = 100
                return this.sourceCache.getCommits(request.source, toBranch.sha, fromVersion ? new Refs.TagRef(`v${fromVersion?.asString()}`) : undefined, MAX_COMMIT_COUNT).then(commits => {
                    const apiCommits = commits.map(c => {
                        return new ApiRepository.Commit(c.sha, c.commiter, c.timestamp, c.message)
                    })
                    ctx.body = Codec.toPlain(new ApiRepository.UnreleasedCommitsResponse(apiCommits))
                })
            } catch (e) {
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.response.message = (<Error>e).message
            }
        })

        router.post("/patch", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.CreatePatchBranchRequest)
            const modelReader = await this.repositoryModelFactory.get(request.source).modelReader()
            try {
                const nextMajor = modelReader.findNextMajor(request.major)
                if (nextMajor) {
                    if (nextMajor.start) {
                        const source = request.source
                        const patchBranchName = `patch-${request.major}`
                        try {
                            const createdBranch = await this.repositoryAccessFactory.createAccess(source.id).createBranch(source.path, Refs.ShaRef.create(nextMajor.start), patchBranchName)
                            const updatedModel = (await this.repositoryModelFactory.get(request.source).modelReader()).model
                            ctx.body = Codec.toPlain(new ApiRepository.CreatePatchBranchResponse(updatedModel, `Branch ${createdBranch.ref.name} was created from sha ${createdBranch.sha.sha}.`))
                        } catch (e) {
                            throw new Error(`Could not create branch ${patchBranchName}. Probably already exists. Root cause: ${e}`)
                        }
                    } else {
                        throw new Error(`The next major (${nextMajor.major}) from major ${request.major} doesn't have a start location (major-${nextMajor.major} git tag)`)
                    }
                } else {
                    throw new Error(`Could not find a next major to major ${request.major}`)
                }
            } catch (e) {
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.response.message = (<Error>e).message
            }
        })
        router.post("/config", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.SourceRequest)
            //const reader = await this.repositoryModelFactory.get(source).modelReader()
            const config = await this.systemFilesAccess.getRepositoryConfig(request.source)
            if (config) {
                ctx.body = Codec.toPlain(new ApiRepository.ConfigResponse(config))
            } else {
                ctx.response.status = HttpStatusCodes.NOT_FOUND
                ctx.body = Codec.toPlain(new ApiRepository.MessageResponse(`Repository has not configuration yet.`))
            }
        })
        router.post("/config/set", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.SaveConfigRequest)
            await this.systemFilesAccess.saveRepositoryConfig(request.source, request.config)
            ctx.body = Codec.toPlain(new ApiRepository.MessageResponse(`Repository config was updated`))
        })

        router.post("/buildlog-events", async (ctx) => {
            const request = Codec.toInstance(ctx.request.rawBody, ApiRepository.BuildLogRequest)
            const log = await this.buildLogService.get(request.source, request.logId)
            ctx.body = Codec.toPlain(new ApiRepository.BuildLogResponse(log))
        })

        router.post("/update-content", async (ctx) => {
            const storageId = _.first([ctx.request.query["storage"]].flat())
            const repoId = _.first([ctx.request.query["id"]].flat())
            const label = _.first([ctx.request.query["label"]].flat())
            if (storageId && repoId && label) {
                const source = new RepositorySource(storageId, repoId)
                const access = this.repositoryAccessFactory.createAccess(source.id)
                logger.debug(`Updating ${source} with label: ${label}`)
                return rawBody(ctx.req).then(async buffer => {
                    const contentList: Promise<Content.Content>[] = []
                    const fileHandler = <TarUtils.Handler>{
                        accept(meta, content) {
                            if (meta.type === "file") {
                                contentList.push(Content.Binary.fromStream(meta.name, content))
                            } else {
                                content.resume()
                            }
                        }
                    }
                    const stream = Readable.from(buffer)
                    try {
                        const modelReader = await this.repositoryModelFactory.get(source).modelReader()
                        const mainBranch = modelReader.model.main.main
                        await TarUtils.extractFiles(stream, fileHandler)
                        const contents = await Promise.all(contentList)
                        if (contents.length) {
                            const updates = await access.getUpdates(source.path)
                            const existing = updates.find(u => { return u.labels.includes(label) && u.target === mainBranch.name })
                            if (existing) {
                                await access.updateUpdate(source.path, existing.id, ...contents).then(updated => {
                                    logger.debug(`Updated existing update ${updated} ${existing} for ${source} with new content: ${contents.map(c => { return c.path })}`)
                                    return Promise.resolve()
                                })
                            } else {
                                await access.createUpdate(source.path, new Refs.BranchRef(mainBranch.name), [label], ...contents).then(updateId => {
                                    logger.debug(`Created new update ${updateId} for ${source} with new content: ${contents.map(c => { return c.path })}`)
                                    return Promise.resolve()
                                })
                            }
                            ctx.response.body = `Updated ${contents.map(c => { return c.path }).join(", ")} in Change`
                            ctx.response.status = HttpStatusCodes.CREATED
                        } else {
                            logger.warn(`Could not create update for tar-file. No content in tar. ${source}`)
                            ctx.response.body = `Tar-file did not contain any entries.`
                            ctx.response.status = HttpStatusCodes.BAD_REQUEST
                        }
                    } catch (e) {
                        logger.warn(`Problem with processing file: ${e} ${source}`)
                        ctx.response.body = `Problem with processing file: ${e}`
                        ctx.response.status = HttpStatusCodes.BAD_REQUEST
                    }
                }).catch(e => {
                    logger.error(`Could not proceed with tar-file for ${source}: ${e}`)
                    ctx.response.body = `Problem with processing file: ${e}`
                    ctx.response.status = HttpStatusCodes.BAD_REQUEST
                })
            } else {
                logger.error(`Bad request: Missing storage, id or label.`)
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.response.body = `Missing parameter "storage", "id" or "label"`
            }
        })

        return Promise.resolve(router)
    }

}

