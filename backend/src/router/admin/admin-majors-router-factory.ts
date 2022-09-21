import HttpStatusCodes from 'http-status-codes'
import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { ApiRepository } from '../../domain-model/api/repository'
import { Codec } from '../../domain-model/system-config/codec'
import { createLogger, loggerName } from "../../logging/logging-factory"
import { MajorApplicationService } from '../../repositories/majors/major-application-service'
import { MajorsService } from "../../repositories/majors/majors-service"
import { ActiveRepositories } from '../../system/queue/active-repositories'
import { RouterFactory } from "../router-factory"


const logger = createLogger(loggerName(__filename))


export class AdminMajorsRouterFactory implements RouterFactory {
    constructor(private majorsService: MajorsService, private majorApplicationService: MajorApplicationService, private activeRepositories: ActiveRepositories) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/admin/majors" })
        router.use(koaBodyParser())
        router.get("/values", async (ctx) => {
            const majorSeries = await this.majorsService.values(false)
            ctx.body = Codec.toPlain(new ApiRepository.MajorSeriesResponse(majorSeries))
        })
        router.post("/values/add", async (ctx) => {
            const request = Codec.toInstance(ctx.request.body, ApiRepository.MajorSerieAddValueRequest)
            await this.majorsService.addValue(request.value).then((value) => {
                this.activeRepositories.activeRepositories().then(repositories => {
                    return this.majorApplicationService.applyMajors(request.value, repositories).then(result => {
                        logger.info(`Added value ${request.value.value} to ${request.value.id}. Processed ${repositories.length} repositories.`)
                        result.forEach(repositoryResult => {
                            logger.debug(`Processed ${repositoryResult.source} ${repositoryResult.action}`)
                        })
                    })
                })
                ctx.body = ctx.body = Codec.toPlain(new ApiRepository.MajorSerieAddValueResponse(value, `Created major value ${request.value.value} in ${request.value.id}.`))
            }).catch((e: Error) => {
                ctx.response.status = HttpStatusCodes.BAD_REQUEST
                ctx.body = Codec.toPlain(new ApiRepository.MessageResponse(`${e}`))
            })
        })
        return Promise.resolve(router)
    }

}

