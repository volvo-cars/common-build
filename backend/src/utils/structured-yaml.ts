import Yaml from 'yaml'
import { Pair } from 'yaml/types'

export namespace StructuredYaml {

    const order: Record<string, number> = {
        "version": 1,
        "toolImage": 2,
        "build": 3,
        "type": 1,
        "secrets": 2,
        "nodes": 3,
        "commands": 4,
        "name": 1,
        "file": 2,
        "target": 3,
        "labels": 4
    }

    export const parse = (yml: string): any => {
        return Yaml.parse(yml)
    }

    export const stringify = (object: object): string => {
        return Yaml.stringify(object, {
            sortMapEntries: (a, b: Pair): number => {
                const sortA = order[a.key] || 0
                const sortB = order[b.key] || 0
                if (sortA && sortB) {
                    return sortA - sortB
                } else if (sortA) {
                    return Number.MAX_SAFE_INTEGER
                } else if (sortB) {
                    return Number.MIN_SAFE_INTEGER
                } else {
                    return a.key > b.key ? Number.MAX_SAFE_INTEGER : (a.key < b.key ? Number.MIN_SAFE_INTEGER : 0)
                }
            },
        })
    }

}