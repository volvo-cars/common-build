import HttpStatusCodes from 'http-status-codes'
import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { CynosureApiConnector } from '../../cynosure/cynosure-api-connector/cynosure-api-connector'
import { CynosureApiConnectorFactory } from '../../cynosure/cynosure-api-connector/cynosure-api-connector-factory'
import { ApiRepository } from "../../domain-model/api/repository"
import { Refs } from '../../domain-model/refs'
import { Codec } from "../../domain-model/system-config/codec"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RepositoryAccessFactory } from '../../repositories/repository-access/repository-access-factory'
import { VersionType } from '../../repositories/repository/repository'
import { RepositoryFactory } from "../../repositories/repository/repository-factory"
import { SystemFilesAccess } from "../../repositories/system-files-access"
import { BuildSystem } from '../../system/build-system'
import { RouterFactory } from "../router-factory"


const logger = createLogger(loggerName(__filename))

export class AdminRepositoryRouterFactory implements RouterFactory {
    constructor(private systemFilesAccess: SystemFilesAccess, private buildSystem: BuildSystem, private repositoryAccessFactory: RepositoryAccessFactory, private repositoryModelFactory: RepositoryFactory, private cynosureApiConnectorFactory: CynosureApiConnectorFactory) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/repository" })
        router.use(koaBodyParser())
        router.post("/model", async (ctx) => {
            const request = Codec.toInstance(ctx.request.body, ApiRepository.SourceRequest)
            const model = (await this.repositoryModelFactory.get(request.source).modelReader()).model
            ctx.body = Codec.toPlain(new ApiRepository.ModelResponse(model))
        })
        router.post("/buildConfig", async (ctx) => {
            const request = Codec.toInstance(ctx.request.body, ApiRepository.BuildConfigRequest)
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
            const request = Codec.toInstance(ctx.request.body, ApiRepository.ReleaseRequest)
            const modelReader = await this.repositoryModelFactory.get(request.source).modelReader()
            const branch = modelReader.findBranch(request.major, undefined) // To include minors after.
            if (branch) {
                const version = await this.buildSystem.release(request.source, branch, VersionType.MINOR)
                const updatedModel = (await this.repositoryModelFactory.get(request.source).modelReader()).model
                ctx.body = Codec.toPlain(new ApiRepository.ReleaseResponse(updatedModel, `Version ${version.asString()} was released from ${request.sha}.`))

            }
        })
        router.post("/patch", async (ctx) => {
            const request = Codec.toInstance(ctx.request.body, ApiRepository.CreatePatchBranchRequest)
            const modelReader = await this.repositoryModelFactory.get(request.source).modelReader()
            try {
                const major = modelReader.model.majors.find(m => { return m.major === request.major })
                if (major) {
                    if (!major.branch) {
                        if (major.start) {
                            const source = request.source
                            const createdBranch = await this.repositoryAccessFactory.createAccess(source.id).createBranch(source.path, Refs.ShaRef.create(major.start), `patch-${request.major}`)
                            const updatedModel = (await this.repositoryModelFactory.get(request.source).modelReader()).model
                            ctx.body = Codec.toPlain(new ApiRepository.CreatePatchBranchResponse(updatedModel, `Branch ${createdBranch.ref.name} was created from sha ${createdBranch.sha.sha}.`))
                        } else {
                            throw new Error(`Major ${request.major} doesn't have a start location (major-${request.major} git tag)`)
                        }
                    } else {
                        throw new Error(`Major ${request.major} already has a patch branch.`)
                    }
                }
            } catch (e) {
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.body = `${e}`
            }
        })
        router.post("/config", async (ctx) => {
            const request = Codec.toInstance(ctx.request.body, ApiRepository.SourceRequest)
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
            const request = Codec.toInstance(ctx.request.body, ApiRepository.SaveConfigRequest)
            await this.systemFilesAccess.saveRepositoryConfig(request.source, request.config)
            ctx.body = Codec.toPlain(new ApiRepository.MessageResponse(`Repository config was updated`))
        })

        return Promise.resolve(router)
    }

}

