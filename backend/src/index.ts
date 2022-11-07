import fs from 'fs'
import Koa from 'koa'
import 'reflect-metadata'
import yargs from 'yargs'
import { ActiveSystemImpl } from './active-system/active-system-impl'
import { ArtifactoryFactoryImpl } from './artifact-storage/artifactory/artifactory-factory'
import { ArtifactoryDockerRegistryFactoryImpl } from './artifact-storage/docker/artifactory-docker-registry-factory'
import { BuildLogServiceImpl } from './buildlog/buildlog-impl'
import { createConfig } from './config/config-factory'
import { EnvValueSubstitutor } from './config/value-substitutors/env-value-substitutor'
import { FileValueSubstitutor } from './config/value-substitutors/file-value-substitutor'
import { VaultValueSubstitutor } from './config/value-substitutors/vault-value-substitutor'
import { createCynosureConnectorFactory } from './cynosure/cynosure-api-connector/cynosure-api-connector-factory'
import { CynosureJobExecutor } from './cynosure/job-executor/cynosure-job-executor'
import { CynosureRouterFactory } from './cynosure/router/cynosure-router-factory'
import { RepositorySource } from './domain-model/repository-model/repository-source'
import { ServiceConfig } from './domain-model/system-config/service-config'
import { LocalGitFactoryImpl } from './git/local-git-factory'
import { createLogger } from './logging/logging-factory'
import { RedisConfig, RedisFactoryImpl } from './redis/redis-factory'
import { DependencyStoragImpl } from './repositories/dependency-manager/dependency-storage-impl'
import { MajorApplicationServiceImpl } from './repositories/majors/major-application-service'
import { MajorsServiceImpl } from './repositories/majors/majors-service'
import { } from './repositories/publisher/publisher-manager'
import { PublisherManagerImpl } from './repositories/publisher/publisher-manager-impl'
import { ChangeCache } from './repositories/repository-access/gerrit/change-cache'
import { GerritRepositoryAccess } from './repositories/repository-access/gerrit/gerrit-repository-access'
import { GerritStreamListener, GerritStreamListenerConfig } from './repositories/repository-access/gerrit/gerrit-stream-listener'
import { RepositoryAccessFactoryImpl } from './repositories/repository-access/repository-access-factory'
import { RepositoryFactoryImpl } from './repositories/repository/repository-factory'
import { DependencyLookupCacheImpl } from './repositories/scanner/dependency-lookup-cache-impl'
import { DependencyLookupFactoryImpl } from './repositories/scanner/dependency-lookup-factory-impl'
import { BuildYamlScanner } from './repositories/scanner/providers/build-yaml-scanner-provider'
import { DependenciesYamlScanner } from './repositories/scanner/providers/dependencies-yaml-scanner-provider'
import { GoogleRepoScanner } from './repositories/scanner/providers/google-repo-scanner-provider'
import { ScannerImpl } from './repositories/scanner/scanner-impl'
import { ScannerManagerImpl } from './repositories/scanner/scanner-manager-impl'
import { SystemFilesAccessImpl } from './repositories/system-files-access-impl'
import { AdminMajorsRouterFactory } from './router/admin/admin-majors-router-factory'
import { AdminRepositoryRouterFactory } from './router/admin/admin-repository-router-factory'
import { AdminRouterFactory } from './router/admin/admin-router-factory'
import { RouterFactory } from './router/router-factory'
import { KoaServiceWrapper } from './shutdown-manager/koa-service-wrapper'
import { ShutdownManagerImpl } from './shutdown-manager/shutdown-manager-impl'
import { BuildSystemImpl } from './system/build-system-impl'
import { NodeId } from './system/node-id'
import { createActiveRepositories } from './system/queue/active-repositories'
import { SourceCacheImpl } from './system/source-cache-impl'
import { SystemTime } from './system/time'
import { TaskQueueFactoryImpl } from './task-queue/task-queue-factory-impl'
import { ensureString } from './utils/ensures'
import { Env } from './utils/env'
import { StructuredYaml } from './utils/structured-yaml'
import { VaultOptions, VaultServiceImpl } from './vault/vault-service'
import { VaultUtils } from './vault/vault-utils'
const logger = createLogger("main")
logger.info("Starting CommonBuild server...")

const args: any = yargs.options({
    config: {
        type: 'string',
        demandOption: true,
        description: "Config file"
    },
    port: {
        type: 'number',
        default: 3000,
        description: "Server port"
    }

}).argv

process.on('uncaughtException', err => {
    logger.error('Uncaught Exception: %s', err.stack)
    process.exit(1)
})
const vaultService = new VaultServiceImpl(new VaultOptions(
    "v1",
    "https://winterfell.csp-dev.net",
    ensureString(process.env.VAULT_TOKEN, "ENV[VAULT_TOKEN] missing."),
    true
))


createConfig(args.config, [new VaultValueSubstitutor(vaultService), new FileValueSubstitutor(), new EnvValueSubstitutor()]).then(async config => {
    console.log("Config:" + JSON.stringify(vaultService.mask(config), null, 2))
    const nodeID = new NodeId(Env.getRequiredString("APP_NODE_ID"))
    logger.debug(`Running in ${nodeID}`)
    const shutdownManager = new ShutdownManagerImpl()

    const redisConfig = new RedisConfig(
        Env.getRequiredString("REDIS_HOST"),
        Env.getOptionalString("REDIS_USER"),
        Env.getOptionalString("REDIS_PASSWORD"),
        parseInt(Env.getOptionalString("REDIS_PORT") || "") || undefined
    )
    logger.info(`Creating Redis with config: ${redisConfig}`)
    const redisFactory = new RedisFactoryImpl(redisConfig)
    shutdownManager.register(redisFactory)

    const activeRepositories = createActiveRepositories(redisFactory)

    const SYSTEM_ID_VAR_NAME = "SYSTEM_ID"
    const FRONTEND_URL_VAR_NAME = "FRONTEND_URL"
    const systemId = process.env[SYSTEM_ID_VAR_NAME]
    if (!systemId) {
        throw new Error(`Missing EnvVar: ${SYSTEM_ID_VAR_NAME}`)
    }
    logger.info(`Starting system with systemId:${systemId}`)
    const frontEndUrl = process.env[FRONTEND_URL_VAR_NAME]
    if (!frontEndUrl) {
        throw new Error(`Missing EnvVar: ${FRONTEND_URL_VAR_NAME}`)
    }

    //DEV
    let preloadRepositories: RepositorySource[] | undefined
    const cbDev = process.env["CB_DEV"]
    if (cbDev) {
        await redisFactory.get().then(client => { return client.flushall() })
        const devFileName = `dev-${cbDev}.yaml`
        if (fs.existsSync(devFileName)) {
            const devFile = fs.readFileSync(devFileName)
            console.log(`Processing dev-file: ${devFileName}`)
            const repositories = <string[]>StructuredYaml.parse(devFile.toString())["repositories"]
            preloadRepositories = repositories.map(line => {
                const [gerrit, path] = line.split(":")
                return new RepositorySource(gerrit, path)
            })
            await activeRepositories.addActiveRepositories(...preloadRepositories)
        }
    }
    //END DEV

    const localGitFactory = new LocalGitFactoryImpl(config.gitCache, config.services.sources, vaultService)
    const repositoryAccessFactory = new RepositoryAccessFactoryImpl(config.services.sources, localGitFactory, vaultService)

    const app = new Koa({ proxy: true })
    app.use(async (ctx: Koa.Context, next: () => Promise<any>) => {
        try {
            await next()
        } catch (error) {
            //ctx.status = error.statusCode || error.status || HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR
            //error.status = ctx.status
            ctx.body = { error }
            ctx.app.emit('error', error, ctx)
        }
    })
    const systemTime = new SystemTime()
    const sourceCache = new SourceCacheImpl(localGitFactory)

    const repositoryFactory = new RepositoryFactoryImpl(redisFactory, sourceCache)

    const buildLogService = new BuildLogServiceImpl(redisFactory, frontEndUrl)
    const cynosureApiConnectorFactory = createCynosureConnectorFactory(redisFactory, config.services.sources)
    const taskQueueFactory = new TaskQueueFactoryImpl(redisFactory, systemTime)
    const cynosureJobExecutor = new CynosureJobExecutor(cynosureApiConnectorFactory, taskQueueFactory.createQueue("cynosure"))
    shutdownManager.register(cynosureJobExecutor)
    const systemFilesAccess = new SystemFilesAccessImpl(repositoryAccessFactory)
    const activeSystem = new ActiveSystemImpl(systemId, systemFilesAccess)
    const artifactoryFactory = new ArtifactoryFactoryImpl(vaultService)
    const dockerRegistryFactory = new ArtifactoryDockerRegistryFactoryImpl(config.services.dockerRegistries, vaultService)
    const majorService = new MajorsServiceImpl(config.majors, redisFactory, repositoryAccessFactory)
    const majorApplicationService = new MajorApplicationServiceImpl(repositoryFactory, repositoryAccessFactory)
    const dependencyStorage = new DependencyStoragImpl(redisFactory)
    const scanner = new ScannerImpl([new GoogleRepoScanner.Provider(repositoryAccessFactory, config.services.sources), new DependenciesYamlScanner.Provider(systemFilesAccess), new BuildYamlScanner.Provider(systemFilesAccess)])
    const dependencyLookupCache = new DependencyLookupCacheImpl(repositoryFactory, artifactoryFactory, dockerRegistryFactory, redisFactory)
    const dependencyLookupFactory = new DependencyLookupFactoryImpl(dependencyLookupCache, systemFilesAccess)
    const scannerManager = new ScannerManagerImpl(repositoryAccessFactory, repositoryFactory, activeRepositories, scanner, dependencyStorage, dependencyLookupFactory, redisFactory, artifactoryFactory, activeSystem, majorService, systemFilesAccess, sourceCache)
    let publisherManager = new PublisherManagerImpl(systemFilesAccess, artifactoryFactory, dockerRegistryFactory)
    const buildSystem = new BuildSystemImpl(redisFactory, systemTime, cynosureJobExecutor, repositoryAccessFactory, repositoryFactory, activeRepositories, publisherManager, scannerManager, activeSystem, buildLogService, dependencyLookupCache, sourceCache, systemFilesAccess)

    const routerFactories: RouterFactory[] = [
        new CynosureRouterFactory(buildSystem, redisFactory),
        new AdminMajorsRouterFactory(majorService, majorApplicationService, activeRepositories),
        new AdminRepositoryRouterFactory(systemFilesAccess, buildSystem, repositoryAccessFactory, repositoryFactory, cynosureApiConnectorFactory, sourceCache, buildLogService),
        new AdminRouterFactory(activeRepositories, majorService, activeSystem)
    ]

    await Promise.all(routerFactories.map(factory => {
        return factory.buildRouter().then(router => {
            app.use(router.routes())
            app.use(router.allowedMethods())
        })
    }))

    // Application error logging.

    app.on('error', (error, ctx) => logger.error("Koa error: %d", error))
    logger.debug(`Starting server on port ${args.port}`)
    const server = app.listen(args.port)
    shutdownManager.register(new KoaServiceWrapper(server))

    const shutdown = (exit: number = 0): void => {
        shutdownManager.shutdownAll()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    config.services.sources.forEach(async sourceConfig => {
        if (sourceConfig instanceof ServiceConfig.GerritSourceService) {
            logger.debug(`Starting gerrit connection. ${sourceConfig.id}`)
            const protectedProjects = preloadRepositories ? preloadRepositories.filter(r => { return r.id === sourceConfig.id }).map(r => { return r.path }) : undefined
            const [user, key] = VaultUtils.splitUserSecret(await vaultService.getSecret(`csp/common-build/ssh-${sourceConfig.ssh}`))
            const listenerConfig = new GerritStreamListenerConfig(sourceConfig, user, key)
            const gerritConnection = new GerritStreamListener(listenerConfig, new ChangeCache(redisFactory, repositoryAccessFactory.getImplementation<GerritRepositoryAccess>(sourceConfig.id)), protectedProjects)
            shutdownManager.register(gerritConnection)
            gerritConnection.start(buildSystem)
        }
    })
    if (cbDev) {
        logger.info("DEV MODE - Scanning all active directories to store dependency information")
        activeRepositories.activeRepositories().then(repositories => {
            logger.info(`DEV MODE - Repositories: ${repositories.join(",")}`)
            repositories.forEach(r => {
                scannerManager.registerDependencies(r)
            })
        })
    }
})




