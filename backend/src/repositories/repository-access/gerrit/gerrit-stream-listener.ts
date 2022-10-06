import _ from 'lodash'
import { Client, ConnectConfig } from 'ssh2'
import { Refs } from '../../../domain-model/refs'
import { RepositorySource } from '../../../domain-model/repository-model/repository-source'
import { ServiceConfig } from '../../../domain-model/system-config/service-config'
import { createLogger, loggerName } from "../../../logging/logging-factory"
import { ShutdownManager } from '../../../shutdown-manager/shutdown-manager'
import { BuildSystem, Update } from "../../../system/build-system"
import { stringNewlineTokenizer } from "../../../utils/string-newline-tokenizer"
import { ChangeCache } from './change-cache'
import { parseChange } from './change-parser'
import { Event } from './stream-model'

const logger = createLogger(loggerName(__filename))

export class GerritStreamListenerConfig {
    constructor(public readonly config: ServiceConfig.GerritSourceService, public readonly user: string, public readonly key: string) { }
}

export class GerritStreamListener implements ShutdownManager.Service {
    private client: Client | null = null
    public serviceName: string
    public shutdownPriority = 10;
    private active: boolean = true
    constructor(private readonly listenerConfig: GerritStreamListenerConfig, private readonly changeCache: ChangeCache, private readonly limitedRepositories: string[] | undefined) {
        this.serviceName = `GerritStreamListener - ${listenerConfig.config.id}`
    }
    private delayStart(reciever: BuildSystem.UpdateReceiver, delaySec: number): void {
        logger.debug(`Starting stream-listener ${this.listenerConfig.config.ssh} in ${delaySec} seconds...`)
        setTimeout(() => {
            this.start(reciever)
        }, delaySec * 1000)
    }
    shutdown(): Promise<void> {
        this.active = false
        this.client?.end()
        return Promise.resolve()
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
                this.delayStart(receiver, 5)
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

                                    let base = <Event.BaseEvent>JSON.parse(event)
                                    if (base.type === Event.ChangeType.refUpdated) {
                                        let event = <Event.RefUpdatedEvent>base


                                        if (!this.limitedRepositories || _.includes(this.limitedRepositories, event.refUpdate.project)) {
                                            const source = new RepositorySource(
                                                this.listenerConfig.config.id,
                                                event.refUpdate.project
                                            )
                                            //console.log(JSON.stringify(event, null, 2))
                                            let change = parseChange(event.refUpdate.refName)
                                            if (change) {
                                                if (_.isNumber(change.patchSetNumber)) {
                                                    const sha = Refs.ShaRef.create(event.refUpdate.newRev)
                                                    const changeNumber = change.changeNumber
                                                    const changeInfo = await this.changeCache.getChangeByChangeNumber(source, changeNumber, sha)
                                                    try {
                                                        const update = new Update(
                                                            source,
                                                            changeInfo.change_id,
                                                            sha,
                                                            changeInfo.branch,
                                                            changeInfo.subject,
                                                            changeInfo.hashtags || [],
                                                            changeNumber,
                                                            `https://${_.trimEnd(this.listenerConfig.config.https, "/")}/c/${source.path}/+/${changeNumber}`
                                                        )
                                                        if (!changeInfo.is_private) {
                                                            const dataJson = JSON.stringify(Object.assign({}, changeInfo, { extras: { patchSet: change.patchSetNumber, number: changeNumber } }), null, 2)
                                                            const comment = `Gerrit \`ref-updated\` [Gerrit](${update.url})\n\n\`\`\`json\n${dataJson}\n\`\`\``

                                                            if (changeInfo.relatedChanges === 0) {
                                                                logger.debug(`Processing ${update}.`)
                                                                receiver.onUpdate(update, comment)
                                                            } else {
                                                                logger.debug(`Change ${update} is not processable. Contains ${changeInfo.relatedChanges} related changes.`)
                                                                receiver.onUpdate(update, `Can not process change because it has related changes (bad practice) in a commit chain (${changeInfo.relatedChanges} changes). To resolve: abandon all related changes, reset your working copy to the latest on \`origin/${update.target}\` and re-push a new commit of your change to \`refs/for/${update.target}\`.\n\n${comment}`, "error")
                                                            }
                                                        } else {
                                                            logger.debug(`Skip processing ${update}. Marked: is_private:true`)
                                                        }
                                                    } catch (e) {
                                                        logger.warn(`Could not fetch change for updateId:${changeNumber} in ${source}: ${JSON.stringify(event.refUpdate.refName)}: ${e}`)
                                                    }
                                                }

                                            } else {
                                                if (event.refUpdate.newRev === "0000000000000000000000000000000000000000") {
                                                    receiver.onDelete(source, Refs.create(event.refUpdate.refName))
                                                } else {
                                                    receiver.onPush(source, Refs.create(event.refUpdate.refName), Refs.ShaRef.create(event.refUpdate.newRev))
                                                }
                                            }
                                        } else if (this.limitedRepositories) {
                                            console.log(`Skipped (protected in dev-config): ${this.listenerConfig.config.id}:${event.refUpdate.project}.`)
                                        }
                                        //listener.onChange(Object.assign({ implementation: ChangeImplementation.GERRIT }, JSON.parse(event)))
                                    }
                                })
                            })
                    } else {
                        logger.error(`Could not execute command on ssh-channel. Stream-listener ${this.listenerConfig.config.id}: ${err}`)
                        this.delayStart(receiver, 5)
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

