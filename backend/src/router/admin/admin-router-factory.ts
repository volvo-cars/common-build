import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { RepositoryFactory } from "../../repositories/repository/repository-factory"
import { RouterFactory } from "../../router/router-factory"
import { ActiveRepositories } from "../../system/queue/active-repositories"
import _ from 'lodash'
import HttpStatusCodes from 'http-status-codes'
import { RepositoryAccessFactory } from "../../repositories/repository-access/repository-access-factory"
import { RepositoryPath, RepositorySource, RepositoryStoreId } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { ApiAdmin } from "../../domain-model/api/admin"
import { MajorsService } from "../../repositories/majors/majors-service"
import { ApiRepository } from "../../domain-model/api/repository"
import { ActiveSystem } from "../../active-system/active-system"


const logger = createLogger(loggerName(__filename))


export class AdminRouterFactory implements RouterFactory {
    constructor(private activeRepositories: ActiveRepositories, private repositoryAccessFactory: RepositoryAccessFactory, private repositoryModelFactory: RepositoryFactory, private majorsService: MajorsService, private activeSystem: ActiveSystem.System) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/admin" })
        router.use(koaBodyParser())
        router.get("/config-values", async (ctx) => {
            const [majorSeries, availableSystems] = await Promise.all([this.majorsService.values(false), this.activeSystem.availableSystems()])
            ctx.body = Codec.toPlain(new ApiRepository.ConfigValuesResponse(majorSeries, availableSystems))
        })
        router.get("/repositories", async (ctx) => {
            const repositories = await this.activeRepositories.activeRepositories()
            ctx.body = Codec.toPlain(new ApiAdmin.ActiveRepositoriesResponse(repositories))
        })
        router.post("/create-release-branch", async (ctx) => {
            const request: CreateReleaseBranchRequest = ctx.request.body
            const major = request.major
            if (_.isNumber(major)) {
                const source = new RepositorySource(request.id, request.path)
                const releaseBranchShas = await this.repositoryModelFactory.get(source).modelReader().then(model => {
                    return model.resolveReadShas(5)
                })
                const majorRead = releaseBranchShas.find(m => { return m.major === major })
                if (majorRead && majorRead.sha) {
                    const branch = await this.repositoryAccessFactory.createAccess(source.id).createBranch(source.path, majorRead.sha, `patch-${major}`)
                    ctx.body = {
                        message: `Created branch`,
                        branch: branch
                    }
                } else {
                    ctx.body = {
                        message: `Could not find major tag for ${major}`
                    }
                }
            } else {
                ctx.body = {
                    message: `Property major was not a number: '${major}'`
                }
                ctx.status = HttpStatusCodes.BAD_REQUEST
            }
        })
        router.post("/release", async (ctx) => {
            const request: ReleaseMajorRequest = ctx.request.body
            const major = request.major
            const repository = request.repository
            const repositoryStorageId = request.id || "csp-gerrit"
            if (_.isNumber(major) && major > 0 && repositoryStorageId) {
                const source = new RepositorySource(repositoryStorageId, repository)
                const repositoryModel = await this.repositoryModelFactory.get(source)
                throw "NI"
            } else {
                ctx.body = {
                    message: `Property major was not a number: '${major}'`
                }
                ctx.status = HttpStatusCodes.BAD_REQUEST
            }
        })

        return Promise.resolve(router)
    }

}


type MajorTickRequest = {
    major: number
}

type CreateReleaseBranchRequest = {
    id: RepositoryStoreId,
    path: RepositoryPath
    major: number
}

type GetModelRequest = {
    id: RepositoryStoreId,
    path: RepositoryPath
}


type ReleaseMajorRequest = {
    id?: RepositoryStoreId,
    repository: RepositoryPath
    major: number
}