import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { ActiveSystem } from "../../active-system/active-system"
import { ApiAdmin } from "../../domain-model/api/admin"
import { ApiRepository } from "../../domain-model/api/repository"
import { Codec } from "../../domain-model/system-config/codec"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { MajorsService } from "../../repositories/majors/majors-service"
import { RepositoryAccessFactory } from "../../repositories/repository-access/repository-access-factory"
import { RepositoryFactory } from "../../repositories/repository/repository-factory"
import { RouterFactory } from "../../router/router-factory"
import { ActiveRepositories } from "../../system/queue/active-repositories"


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
        return Promise.resolve(router)
    }
}