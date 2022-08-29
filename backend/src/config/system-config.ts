import { Expose, Type } from "class-transformer"
import { RepositorySource } from "../domain-model/repository-model/repository-source"
import { ServiceConfig } from "../domain-model/system-config/service-config"

export namespace SystemConfig {

    export class Redis {
        @Expose()
        host: string
        constructor(host: string) {
            this.host = host
        }
    }

    export class Engine {
        @Expose()
        concurrency: number
        constructor(concurrency: number) {
            this.concurrency = concurrency
        }
    }

    export class GitCacheCommitter {
        @Expose()
        name: string
        @Expose()
        email: string
        constructor(name: string, email: string) {
            this.name = name
            this.email = email
        }
    }

    export class GitCache {
        @Expose()
        path: string
        @Expose()
        committer: GitCacheCommitter
        constructor(path: string, committer: GitCacheCommitter) {
            this.path = path
            this.committer = committer
        }
    }

    export class Majors {
        @Expose()
        series: string[]
        @Expose()
        source: RepositorySource
        constructor(series: string[], source: RepositorySource) {
            this.series = series
            this.source = source
        }
    }


    export class Config {
        @Expose()
        @Type(() => ServiceConfig.Services)
        services: ServiceConfig.Services

        @Expose()
        @Type(() => Redis)
        redis: Redis

        @Expose()
        @Type(() => Majors)
        majors: Majors

        @Expose()
        @Type(() => GitCache)
        gitCache: GitCache

        @Expose()
        @Type(() => Engine)
        engine: Engine
        constructor(services: ServiceConfig.Services, redis: Redis, majors: Majors, gitCache: GitCache, engine: Engine) {
            this.services = services
            this.redis = redis
            this.majors = majors
            this.gitCache = gitCache
            this.engine = engine
        }
    }



}