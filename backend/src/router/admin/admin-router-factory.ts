import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { ActiveSystem } from "../../active-system/active-system"
import { ApiAdmin } from "../../domain-model/api/admin"
import { ApiRepository } from "../../domain-model/api/repository"
import { Codec } from "../../domain-model/system-config/codec"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { MajorsService } from "../../repositories/majors/majors-service"
import { RouterFactory } from "../../router/router-factory"
import { ActiveRepositories } from "../../system/queue/active-repositories"
import HttpStatusCodes from 'http-status-codes'

const logger = createLogger(loggerName(__filename))


export class AdminRouterFactory implements RouterFactory {
    constructor(private activeRepositories: ActiveRepositories, private majorsService: MajorsService, private activeSystem: ActiveSystem.System) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/admin" })
        router.use(koaBodyParser())
        router.get("/config-values", async (ctx) => {
            return Promise.all([this.majorsService.values(false), this.activeSystem.availableSystems()]).then(([majorSeries, availableSystems]) => {
                ctx.body = Codec.toPlain(new ApiRepository.ConfigValuesResponse(majorSeries, availableSystems))
            }).catch(e => {
                ctx.response.status = HttpStatusCodes.INTERNAL_SERVER_ERROR
                ctx.body = `Could not load MajorSeries or AvailableSystems: ${e}`
            })
        })
        router.get("/repositories", async (ctx) => {
            const repositories = await this.activeRepositories.activeRepositories()
            ctx.body = Codec.toPlain(new ApiAdmin.ActiveRepositoriesResponse(repositories))
        })
        return Promise.resolve(router)
    }
}