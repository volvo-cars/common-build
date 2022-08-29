import koaBodyParser from "koa-bodyparser"
import Router from "koa-router"
import { createLogger, loggerName } from "../../logging/logging-factory"
import { RedisFactory } from "../../redis/redis-factory"
import { RouterFactory } from "../../router/router-factory"
import { BuildSystem } from "../../system/build-system"
enum ProductType {
    source = "source",
    blob = "blob"
}

type ProductId = {
    namespace: ProductNamespace
    instance: ProductInstance
}
type ProductNamespace = string
type ProductInstance = string

type ProductStateEvent = {
    productId: ProductId
    type: ProductType
}

type ProductSourceMetaData = {
    title: string
}

type ProductSourceEvent = ProductStateEvent & {
    metadata: ProductSourceMetaData
    track: string
}

const logger = createLogger(loggerName(__filename))

export class CynosureRouterFactory implements RouterFactory {
    constructor(private buildSystem: BuildSystem, private redis: RedisFactory) { }

    buildRouter(): Promise<Router> {
        const router = new Router({ prefix: "/cynosure" })

        router.use(koaBodyParser())
        router.post("/product-updated-self", async (ctx) => {
            return this.redis.get().then(client => {
                let message = "Hello  product updated"
                ctx.body = {
                    message: message
                }
                ctx.status = 200
            })
        })
        router.get("/product-updated-dependency", async (ctx) => {
            ctx.body = "Hello product updated DEPENDENCY"
        })
        return Promise.resolve(router)
    }

}