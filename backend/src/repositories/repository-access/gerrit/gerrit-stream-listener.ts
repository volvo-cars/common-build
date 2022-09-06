import _ from 'lodash'
import { Client, ConnectConfig } from 'ssh2'
import { SystemConfig } from '../../../config/system-config'
import { Refs } from '../../../domain-model/refs'
import { RepositorySource } from '../../../domain-model/repository-model/repository-source'
import { ServiceConfig } from '../../../domain-model/system-config/service-config'
import { createLogger, loggerName } from "../../../logging/logging-factory"
import { Update } from "../../../system/build-system"
import { stringNewlineTokenizer } from "../../../utils/string-newline-tokenizer"
import { VaultService } from '../../../vault/vault-service'
import { ChangeCache } from './change-cache'
import { parseChange } from './change-parser'
import { Event } from './stream-model'

const logger = createLogger(loggerName(__filename))

export interface UpdateReceiver {
    onUpdate(update: Update): Promise<void>
    onPush(source: RepositorySource, ref: Refs.Ref, newSha: Refs.ShaRef): Promise<void>
    onDelete(source: RepositorySource, ref: Refs.Ref): Promise<void>
}

export class GerritStreamListenerConfig {
    constructor(public readonly config: ServiceConfig.GerritSourceService, public readonly user: string, public readonly key: string) { }
}

export class GerritStreamListener {
    private client: Client | null = null
    constructor(private readonly listenerConfig: GerritStreamListenerConfig, private readonly changeCache: ChangeCache, private readonly limitedRepositories: string[] | undefined) { }
    start(receiver: UpdateReceiver): void {

        logger.info(`Starting gerrit listener on: ${this.listenerConfig.config.ssh}`)
        const client = new Client()

        client.on('error', (e) => {
            const wait = 5
            logger.error(`Could not connect to ${this.listenerConfig.config.ssh}: ${e}. Reconnecting in ${wait} seconds...`)
            setTimeout(() => {
                this.start(receiver)
            }, wait * 1000)
        })
        client.on('ready', () => {
            logger.debug(`Connected stream listener to ${this.listenerConfig.config.id}: ${this.listenerConfig.config.ssh}`) // Is defined
            let fullData = ""
            client.exec("gerrit stream-events", (err, stream) => {
                if (!err) {
                    stream
                        .on("close", () => {
                            logger.info(`Closing down stream-listener for ${this.listenerConfig.config.id}`)
                            client.end()
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
                                                const changeNumber = change.changeNumber

                                                const changeInfo = await this.changeCache.getChangeByChangeNumber(source, changeNumber)
                                                if (changeInfo) {
                                                    let update = new Update(
                                                        source,
                                                        changeInfo.change_id,
                                                        Refs.ShaRef.create(event.refUpdate.newRev),
                                                        changeInfo.branch,
                                                        changeInfo.subject,
                                                        changeInfo.hashtags || [],
                                                        changeNumber
                                                    )

                                                    logger.info(`Downloaded ${update} with ${event.refUpdate.newRev}`)
                                                    //console.log(JSON.stringify(event, null, 2))
                                                    receiver.onUpdate(update)
                                                } else {
                                                    logger.warn(`Could not fetch changeId for updateId:${changeNumber}: ${JSON.stringify(event.refUpdate.refName)}`)
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
                    logger.error(`Could not connect to stream-listener ${this.listenerConfig.config.id}: ${err}`)
                    setTimeout(() => {
                        logger.info(`Trying to reconnect to stream-listener ${this.listenerConfig.config.id}.`)
                        this.start(receiver)
                    }, 5000)
                }
            })
        }).connect(
            <ConnectConfig>{
                host: this.listenerConfig.config.ssh,
                username: this.listenerConfig.user,
                privateKey: this.listenerConfig.key
            }
        )
        this.client = client
    }
}

