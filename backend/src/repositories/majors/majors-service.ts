import _ from "lodash";
import { SystemConfig } from "../../config/system-config";
import { Refs } from "../../domain-model/refs";
import { Codec } from "../../domain-model/system-config/codec";
import { Majors } from "../../domain-model/system-config/majors";
import { RedisFactory } from "../../redis/redis-factory";
import { RepositoryAccessFactory } from "../repository-access/repository-access-factory";

export interface MajorsService {
    values(cached: boolean): Promise<Majors.Serie[]>
    getValue(id: string, cached: boolean): Promise<Majors.Serie | undefined>
    addValue(value: Majors.Value): Promise<Majors.Serie>
}

export class MajorsServiceImpl implements MajorsService {
    private static STATE_FILE = "majors-values.json"
    private static STATE_CACHE_KEY = "majors-config"
    private static STATE_CACHE_TTL = 5 * 60
    constructor(private config: SystemConfig.Majors, private redisFactory: RedisFactory, private repositoryAccessFactory: RepositoryAccessFactory) { }
    getValue(id: string, cached: boolean): Promise<Majors.Serie | undefined> {
        return this.values(cached).then(all => {
            return all.find(v => { return v.id === id })
        })
    }

    values(cached: boolean): Promise<Majors.Serie[]> {
        return this.redisFactory.get().then(async client => {
            try {
                if (cached) {
                    const values = await client.get(MajorsServiceImpl.STATE_CACHE_KEY)
                    if (values) {
                        return this.normalize(Codec.toInstances(values, Majors.Serie))
                    }
                }
            } catch (e) {
                return Promise.reject(`Could not load cached series: ${e}`)
            }
            const series = this.normalize(await this.getSourceValues())
            return client.set(MajorsServiceImpl.STATE_CACHE_KEY, JSON.stringify(Codec.toPlain(series)), "EX", MajorsServiceImpl.STATE_CACHE_TTL).then(() => {
                return Promise.resolve(series)
            })
        })
    }

    private normalize(series: Majors.Serie[]): Majors.Serie[] {
        const clean = series.filter(serie => { return _.includes(this.config.series, serie.id) })
        const existingIds = _.uniq(series.map(serie => { return serie.id }))
        const nonExisting = _.difference(this.config.series, existingIds)
        return _.concat(clean, nonExisting.map(id => { return new Majors.Serie(id, [0]) }))
    }

    addValue(value: Majors.Value): Promise<Majors.Serie> {
        if (value.value > 0) {
            if (_.includes(this.config.series, value.id)) {
                return this.getSourceValues().then(series => {
                    const existingIndex = _.findIndex(series, serie => {
                        return serie.id === value.id
                    })
                    if (existingIndex >= 0) {
                        const highest = _.max(series[existingIndex].values)
                        if (highest && value.value <= highest) {
                            return Promise.reject(`Major value ${value.value} must be higher than existing major value: ${highest}`)
                        }
                        series[existingIndex].values = _.sortBy(_.concat([value.value], series[existingIndex].values), (n) => { return n * -1 })
                    } else {
                        series.push(new Majors.Serie(value.id, [value.value]))
                    }
                    const access = this.repositoryAccessFactory.createAccess(this.config.source.id)
                    return access.updateBranch(this.config.source.path, Refs.BranchRef.create("master"), [{
                        data: JSON.stringify(Codec.toPlain(series), null, 2),
                        path: MajorsServiceImpl.STATE_FILE
                    }]).then(() => {
                        return this.redisFactory.get().then(client => {
                            return client.del(MajorsServiceImpl.STATE_CACHE_KEY).then(() => {
                                if (existingIndex) {
                                    return series[existingIndex]
                                } else {
                                    return series[series.length - 1]
                                }
                            })
                        })
                    })
                })
            } else {
                return Promise.reject(new Error(`Major serie ${value.id} is not a valid serie. Valid series are: ${this.config.series.join(",")}`))
            }
        } else {
            return Promise.reject(new Error(`Input '${value}' is not a positive number.`))
        }

    }

    private getSourceValues(): Promise<Majors.Serie[]> {
        const source = this.config.source
        const access = this.repositoryAccessFactory.createAccess(source.id)

        return access.getBranch(source.path, "master").then(branch => {
            if (branch) {
                return access.getFile(source.path, MajorsServiceImpl.STATE_FILE, branch.sha).then(file => {
                    if (file) {
                        try {
                            const majors = Codec.toInstances(file, Majors.Serie)
                            return majors.filter(m => { return m.id && m.values })
                        } catch (e) {
                            return Promise.reject(`Could not parse remote file: ${source}/${MajorsServiceImpl.STATE_FILE}: ${e}`)
                        }
                    } else {
                        return []
                    }
                })
            } else {
                return Promise.reject(new Error(`Could not find branch master.`))
            }
        })
    }
}

