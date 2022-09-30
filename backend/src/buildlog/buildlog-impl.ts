import _ from "lodash";
import { BuildLogEvents } from "../domain-model/buildlog-events/buildlog-events";
import { Refs } from "../domain-model/refs";
import { RepositorySource } from "../domain-model/repository-model/repository-source";
import { Codec } from "../domain-model/system-config/codec";
import { RedisFactory } from "../redis/redis-factory";
import { RedisUtils } from "../redis/redis-utils";
import { Duration, Time } from "../task-queue/time";
import { BuildLog } from "./buildlog";

const logTTLDays = Duration.fromDays(14)

export class BuildLogServiceImpl implements BuildLog.Service {

    constructor(private redisFactory: RedisFactory, private frontendUrl: string) { }
    getLogUrl(source: RepositorySource, logId: string): string {
        return `${_.trimEnd(this.frontendUrl, "/")}/repo/${source.id}.${source.path.replace("/", ".")}/logs/${logId}`
    }
    private createEntryKey(source: RepositorySource, logId: string): string {
        return `build-log-entries:${source.asString()}:${logId}`
    }
    private createMetaKey(source: RepositorySource, logId: string): string {
        return `build-log-meta${source.asString()}:${logId}`
    }

    get(source: RepositorySource, logId: string): Promise<BuildLogEvents.BuildLog> {
        return this.redisFactory.get().then(client => {
            const entriesKey = this.createEntryKey(source, logId)
            const metaKey = this.createMetaKey(source, logId)
            return RedisUtils.executeMulti(client.multi()
                .lrange(entriesKey, 0, 9999999)
                .hgetall(metaKey)
            ).then(result => {
                const entries = (<string[]>result[0]).map(s => { return Codec.toInstance(s, BuildLogEvents.Entry) })
                entries.reverse()
                const metaUrlObject: Record<string, string> = result[1] || {}
                const metaUrls = Object.keys(metaUrlObject).reduce((acc, name) => {
                    acc.set(name, metaUrlObject[name])
                    return acc
                }, new Map<string, string>())
                return new BuildLogEvents.BuildLog(entries, metaUrls)
            })
        })
    }

    addMetaUrl(name: string, url: string, source: RepositorySource, logId: string): Promise<void> {
        return this.redisFactory.get().then(client => {
            const metaKey = this.createMetaKey(source, logId)
            return RedisUtils.executeMulti(client.multi()
                .hset(metaKey, { [name]: url })
                .expire(metaKey, logTTLDays.seconds())
            ).then(result => { })
        })
    }

    add(message: string, level: BuildLogEvents.Level, source: RepositorySource, logId: string): Promise<void> {
        return this.redisFactory.get().then(client => {
            const entriesKey = this.createEntryKey(source, logId)
            const metaKey = this.createMetaKey(source, logId)
            return RedisUtils.executeMulti(client.multi()
                .rpush(entriesKey, Codec.toJson(new BuildLogEvents.Entry(message, level, Time.now().toDate())))
                .expire(entriesKey, logTTLDays.seconds())
                .expire(metaKey, logTTLDays.seconds())
            ).then(result => { })
        })
    }
}