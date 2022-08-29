import YAML from 'yaml'
import { createLogger, loggerName } from '../logging/logging-factory'
import { Substitutor, ValueSubstitutor } from './value-substitutor'
import * as fs from 'fs'
import { SystemConfig } from './system-config'
import { Codec } from '../domain-model/system-config/codec'
import { ServiceConfig } from '../domain-model/system-config/service-config'

const logger = createLogger(loggerName(__filename))

export const createConfig = async (file: string, substitutors: ValueSubstitutor[]): Promise<SystemConfig.Config> => {

    logger.debug(`Reading config file: ${file} with substitutors: ${substitutors.map(s => { return s.name }).join(",")}`)
    const substitutor = new Substitutor(substitutors)
    const object = YAML.parse(fs.readFileSync(file, 'utf8'))
    return substitutor.substitute(object).then(r => {
        return Codec.toInstance(r, SystemConfig.Config)
    })
}