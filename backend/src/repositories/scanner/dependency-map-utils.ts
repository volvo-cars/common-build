import { Version } from "../../domain-model/version";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import _ from 'lodash'
export class DependencyMapUtils {
    private constructor() { }

    static toObject(map: Map<DependencyRef.Ref, Version[]>): object {
        const o: any = {}
        map.forEach((versions: Version[], key: DependencyRef.Ref) => {
            o[key.serialize()] = versions.map(v => { return v.asString() })
        });
        return o
    }
    static fromObject(o: any): Map<DependencyRef.Ref, Version[]> {
        const m = new Map<DependencyRef.Ref, Version[]>()
        Object.keys(o).forEach(serializedRef => {
            const serializedVersions = (<string[]>o[serializedRef]).map(v => { return Version.create(v) })
            m.set(DependencyRef.deserialize(serializedRef), serializedVersions)
        })
        return m
    }

    static merge(...maps: Map<DependencyRef.Ref, Version[]>[]): Map<DependencyRef.Ref, Version[]> {
        const serializedMap = new Map<string, string[]>()
        maps.forEach(map => {
            map.forEach((versions, ref) => {
                const serializedRef = ref.serialize()
                const existingVersions = _.concat(serializedMap.get(serializedRef) || [], versions.map(version => { return version.asString() }))
                serializedMap.set(serializedRef, existingVersions)
            })
        })
        const resultMap: Map<DependencyRef.Ref, Version[]> = new Map()
        serializedMap.forEach((serializedVersions, serializedRef) => {
            resultMap.set(DependencyRef.deserialize(serializedRef), _.uniq(serializedVersions).map(s => { return Version.create(s) }))
        })
        return resultMap
    }


}