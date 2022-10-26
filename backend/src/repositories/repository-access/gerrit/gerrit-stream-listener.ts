import _ from 'lodash'
import { Client, ConnectConfig } from 'ssh2'
import { Refs } from '../../../domain-model/refs'
import { RepositorySource } from '../../../domain-model/repository-model/repository-source'
import { ServiceConfig } from '../../../domain-model/system-config/service-config'
import { createLogger, loggerName } from "../../../logging/logging-factory"
import { ShutdownManager } from '../../../shutdown-manager/shutdown-manager'
import { BuildSystem, Update } from "../../../system/build-system"
import { Duration } from '../../../task-queue/time'
import { PromiseUtils } from '../../../utils/promise-utils'
import { stringNewlineTokenizer } from "../../../utils/string-newline-tokenizer"
import { ChangeCache } from './change-cache'
import { Events } from './events'
import { GerritUpdate } from './gerrit-update'

const logger = createLogger(loggerName(__filename))

export class GerritStreamListenerConfig {
    constructor(public readonly config: ServiceConfig.GerritSourceService, public readonly user: string, public readonly key: string) { }
}

export class GerritStreamListener implements ShutdownManager.Service {
    private client: Client | null = null
    public serviceName: string
    public shutdownPriority = 10;
    private active: boolean = true

    private validRefs = [/^refs\/heads\//, /^refs\/tags\//, /^refs\/meta\/config$/]

    constructor(private readonly listenerConfig: GerritStreamListenerConfig, private readonly changeCache: ChangeCache, private readonly limitedRepositories: string[] | undefined) {
        this.serviceName = `GerritStreamListener - ${listenerConfig.config.id}`
    }
    private delayStart(reciever: BuildSystem.UpdateReceiver, delay: Duration): void {
        logger.debug(`Starting stream-listener ${this.listenerConfig.config.ssh} in ${delay.seconds()} seconds...`)
        PromiseUtils.waitPromise(delay).then(() => {
            this.start(reciever)
        })
    }
    shutdown(): Promise<void> {
        this.active = false
        this.client?.end()
        return Promise.resolve()
    }

    isProjectActive(project: string): boolean {
        return !this.limitedRepositories || _.includes(this.limitedRepositories, project)
    }

    start(receiver: BuildSystem.UpdateReceiver): void {
        if (this.active) {
            logger.info(`Starting gerrit listener on: ${this.listenerConfig.config.ssh}`)
            if (this.client) {
                this.client.end()
            }
            const client = new Client()

            client.on('error', (e) => {
                logger.error(`Could not connect to ${this.listenerConfig.config.ssh}: ${e}.`)
                this.delayStart(receiver, Duration.fromSeconds(5))
            })
            client.on('ready', () => {
                logger.debug(`Connected stream listener to ${this.listenerConfig.config.id}: ${this.listenerConfig.config.ssh}`) // Is defined
                let fullData = ""
                client.exec("gerrit stream-events", (err, stream) => {
                    if (!err) {
                        stream
                            .on("close", () => {
                                logger.info(`Closing down stream-listener for ${this.listenerConfig.config.id}`)
                                this.start(receiver)
                            })
                            .on("data", (chunk: string) => {
                                fullData = stringNewlineTokenizer(fullData + chunk, async (event: string) => {
                                    const json = JSON.parse(event)
                                    const type = json["type"]
                                    if (type) {
                                        if (type === Events.TypeRefUpdated) {
                                            const event = <Events.RefUpdateEvent>json
                                            if (this.isProjectActive(event.refUpdate.project)) {
                                                if (this.validRefs.find(regExp => {
                                                    return regExp.test(event.refUpdate.refName)
                                                })) {
                                                    const source = new RepositorySource(
                                                        this.listenerConfig.config.id,
                                                        event.refUpdate.project
                                                    )
                                                    const ref = Refs.tryCreateFromRemoteRef(event.refUpdate.refName)
                                                    if (ref) {
                                                        if (event.refUpdate.newRev === "0000000000000000000000000000000000000000") {
                                                            receiver.onDelete(source, ref)
                                                        } else {
                                                            const newSha = Refs.ShaRef.create(event.refUpdate.newRev)
                                                            if (ref instanceof Refs.TagRef) {
                                                                receiver.onPush(source, new Refs.Tag(ref, newSha))
                                                            } else if (ref instanceof Refs.BranchRef) {
                                                                receiver.onPush(source, new Refs.Branch(ref, newSha))
                                                            } else {
                                                                logger.error(`Unknown ref decoded: ${ref.constructor.name} in ${source}`)
                                                            }
                                                        }
                                                    } else {
                                                        logger.debug(`Ref not decoded: ${event.refUpdate.refName} ${source}`)
                                                    }
                                                }
                                            }
                                        } else if (type === Events.TypePatchSetCreated) {
                                            const event = <Events.PatchSetCreatedEvent>json
                                            if (!event.change.private) {
                                                if (this.isProjectActive(event.project)) {
                                                    const source = new RepositorySource(
                                                        this.listenerConfig.config.id,
                                                        event.project
                                                    )
                                                    const update = new GerritUpdate(
                                                        source,
                                                        event.change.id,
                                                        Refs.ShaRef.create(event.patchSet.revision),
                                                        event.change.branch,
                                                        event.change.subject,
                                                        event.change.hashtags || [],
                                                        event.change.url,
                                                        event.change.number
                                                    )
                                                    const relatedChangesCount = await this.changeCache.getRelatedChanges(source, update.id, update.sha)
                                                    const dataJson = JSON.stringify(event, null, 2)
                                                    const comment = `Gerrit \`ref-updated\` [Gerrit](${update.url})\n\n\`\`\`json\n${dataJson}\n\`\`\``

                                                    if (relatedChangesCount === 0) {
                                                        receiver.onUpdate(update, comment)
                                                    } else {
                                                        logger.warn(`Change ${update} is not processable. Contains ${relatedChangesCount} related changes.`)
                                                        receiver.onUpdate(update, `Can not process change because it has related changes (bad practice) in a commit chain (${relatedChangesCount} changes). To resolve: abandon all related changes, reset your working copy to the latest on \`origin/${update.target}\` and re-push a new commit of your change to \`refs/for/${update.target}\`.\n\n${comment}`, "error")
                                                    }
                                                }
                                            }
                                        } else if (type === Events.TypeChangeMerged) {
                                            const event = <Events.ChangeMergedEvent>json
                                            if (this.isProjectActive(event.project)) {
                                                const source = new RepositorySource(
                                                    this.listenerConfig.config.id,
                                                    event.project
                                                )
                                                receiver.onPrune(source)
                                            }
                                        }
                                    }
                                })
                            })
                    } else {
                        logger.error(`Could not execute command on ssh-channel. Stream-listener ${this.listenerConfig.config.id}: ${err}`)
                        this.delayStart(receiver, Duration.fromSeconds(5))
                    }
                })
            }).connect(
                <ConnectConfig>{
                    host: this.listenerConfig.config.ssh,
                    username: this.listenerConfig.user,
                    privateKey: this.listenerConfig.key,
                    /** How often (in milliseconds) to send SSH-level keepalive packets to the server. Set to 0 to disable. */
                    keepaliveInterval: 10 * 1000,
                    /** How many consecutive, unanswered SSH-level keepalive packets that can be sent to the server before disconnection. */
                    keepaliveCountMax: 1,
                    readyTimeout: 10 * 1000
                }
            )
            this.client = client
        }
    }
}

