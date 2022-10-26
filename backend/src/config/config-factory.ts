import * as fs from 'fs'
import { Codec } from '../domain-model/system-config/codec'
import { createLogger, loggerName } from '../logging/logging-factory'
import { StructuredYaml } from '../utils/structured-yaml'
import { SystemConfig } from './system-config'
import { Substitutor, ValueSubstitutor } from './value-substitutor'

const logger = createLogger(loggerName(__filename))

export const createConfig = async (file: string, substitutors: ValueSubstitutor[]): Promise<SystemConfig.Config> => {

    logger.debug(`Reading config file: ${file} with substitutors: ${substitutors.map(s => { return s.name }).join(",")}`)
    const substitutor = new Substitutor(substitutors)
    const object = StructuredYaml.parse(fs.readFileSync(file, 'utf8'))
    return substitutor.substitute(object).then(r => {
        return Codec.toInstance(r, SystemConfig.Config)
    })
}