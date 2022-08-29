import * as cheerio from 'cheerio';
import _ from 'lodash';
import { DefaulXmlExtractor } from '../../../domain-model/default-xml-extractor';
import { Refs } from '../../../domain-model/refs';
import { RepositorySource } from '../../../domain-model/repository-model/repository-source';
import { DependencyRef } from '../../../domain-model/system-config/dependency-ref';
import { ServiceConfig } from '../../../domain-model/system-config/service-config';
import { createLogger, loggerName } from '../../../logging/logging-factory';
import { splitAndFilter } from '../../../utils/string-util';
import { RepositoryAccessFactory } from '../../repository-access/repository-access-factory';
import { DependencyProvider } from '../dependency-provider';
import { LabelCriteria } from '../label-criteria';
import { DependencyUpdate, ScanResult } from '../scanner';
import { Dependency, ScannerProvider } from "../scanner-provider";
import { RevisionUtil } from './revision-util';

const logger = createLogger(loggerName(__filename))

export class GoogleRepoScannerProvider implements ScannerProvider {
    private static DEFAULT_XML_FILE = "default.xml"

    constructor(private repositoryAccessFactory: RepositoryAccessFactory, private sources: ServiceConfig.SourceService[]) { }

    async dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Dependency[]> {
        const defaultXml = await this.repositoryAccessFactory.createAccess(source.id).getFile(source.path, GoogleRepoScannerProvider.DEFAULT_XML_FILE, ref)
        if (defaultXml) {
            const $ = cheerio.load(defaultXml, {
                xmlMode: true
            })

            const defaultRemoteName = $("default").attr("remote")

            const extractor = DefaulXmlExtractor.Extractor.createFromXml($)
            const extracts = extractor.extract()

            const allDependencies: Dependency[] = []
            $("project").each((n, elem) => {
                const item = $(elem)
                const name = item.attr("name")
                const dependencyRevision = item.attr("revision")
                const dependencyRemoteName = item.attr("remote") || defaultRemoteName || ""
                const dependencyRemote = extracts.find(e => { return e.name === dependencyRemoteName })
                if (dependencyRemote) {
                    if (name && dependencyRevision) {
                        let trimmedName = name.replace(/\.git$/i, "")
                        if (dependencyRemote.path) {
                            trimmedName = [dependencyRemote.path, trimmedName].join("/")
                        }
                        const version = RevisionUtil.extractVersion(dependencyRevision)
                        if (version) {
                            const source = this.findSource(dependencyRemote)
                            if (source) {
                                allDependencies.push(new Dependency(
                                    new DependencyRef.GitRef(new RepositorySource(source.id, trimmedName)),
                                    version
                                ))
                            } else {
                                logger.warn(`Could not find mapping for source: ${dependencyRemote.host}`)
                            }
                        }
                    }
                } else {
                    logger.warn(`Missing remote host mapping for ${defaultRemoteName} in ${this.sources.join(",")} ${source}/${ref.name} ${name}/${dependencyRevision}`)
                }
            })
            return allDependencies
        } else {
            return Promise.resolve([])
        }
    }

    private findSource(extract: DefaulXmlExtractor.HostExtract): ServiceConfig.SourceService | undefined {
        return this.sources.find(s => {
            if (s instanceof ServiceConfig.GerritSourceService) {
                if (extract.host === s.ssh && extract.protocol === DefaulXmlExtractor.Protocol.ssh) {
                    return true
                }
            }
            if (s instanceof ServiceConfig.GitlabSourceService) {
                if (extract.host === s.https && extract.protocol === DefaulXmlExtractor.Protocol.https) {
                    return true
                }
            }
            return false
        })
    }



    async scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult> {
        const defaultXml = await this.repositoryAccessFactory.createAccess(source.id).getFile(source.path, GoogleRepoScannerProvider.DEFAULT_XML_FILE, ref)
        if (defaultXml) {

            const $$ = cheerio.load(defaultXml, {
                xmlMode: true
            })

            const extractor = DefaulXmlExtractor.Extractor.createFromXml($$)
            const extracts = extractor.extract()

            const defaultRemoteName = $$("default").attr("remote")
            const defaultRevision = $$("default").attr("revision")

            const allLabels: string[][] = []
            $$("project").each((n, elem) => {
                const item = $$(elem)
                allLabels.push(splitAndFilter(item.attr("label") || item.attr("labels") || LabelCriteria.DEFAULT_LABEL_NAME))
            })
            const allDependencies: DependencyRef.Ref[] = []
            const relevantLabels = labelCriteria.include(_.flatten(allLabels))
            const allUpdates = _.flatten(await Promise.all(relevantLabels.map(async relevantLabel => {
                const $ = cheerio.load(defaultXml, {
                    xmlMode: true
                })
                let replaces: Promise<void>[] = []
                let changeCount = 0
                $("project").each((n, elem) => {
                    const item = $(elem)
                    const name = item.attr("name")
                    const dependencyRevision = item.attr("revision") || defaultRevision
                    const dependencyRemoteName = item.attr("remote") || defaultRemoteName || ""
                    const dependencyRemote = extracts.find(e => { return e.name === dependencyRemoteName })
                    if (dependencyRemote) {
                        if (name) {
                            const relevantLabels = splitAndFilter(item.attr("label") || item.attr("labels") || LabelCriteria.DEFAULT_LABEL_NAME)
                            const process = _.includes(relevantLabels, relevantLabel)
                            if (process) {
                                let trimmedName = name.replace(/\.git$/i, "")
                                if (dependencyRemote.path) {
                                    trimmedName = [dependencyRemote.path, trimmedName].join("/")
                                }
                                replaces.push(new Promise<void>((resolve, reject) => {
                                    const sourceConfig = this.findSource(dependencyRemote)
                                    if (sourceConfig) {
                                        const dependencyRef = new DependencyRef.GitRef(new RepositorySource(sourceConfig.id, trimmedName))
                                        allDependencies.push(dependencyRef)
                                        const validDependencyVersion = dependencyRevision ? RevisionUtil.extractVersion(dependencyRevision) : undefined
                                        if (validDependencyVersion !== null) {
                                            dependencyProvider.getVersion(dependencyRef).then(newVersion => {
                                                if (newVersion) {
                                                    if (!validDependencyVersion || newVersion.compare(validDependencyVersion) !== 0) {
                                                        item.attr("revision", RevisionUtil.encodeVersion(newVersion))
                                                        changeCount++
                                                    }
                                                }
                                                resolve()
                                            }).catch(e => { resolve(e) })
                                        } else {
                                            resolve()
                                        }
                                    } else {
                                        logger.warn(`Could not find configured source for host ${dependencyRemote} in ${GoogleRepoScannerProvider.DEFAULT_XML_FILE}. (${source.toString()}/${ref.name}) in config ${this.sources.join(",")}`)
                                        resolve()
                                    }
                                }))
                            }
                        }
                    } else {
                        logger.warn(`Missing remote host mapping for ${defaultRemoteName} in ${extracts.map(e => { return `${e.name}=${e.host}` }).join(",")} ${source}/${ref.name} ${name}/${dependencyRevision}`)
                    }
                })
                await Promise.all(replaces)
                if (changeCount) {
                    return Promise.resolve([
                        <DependencyUpdate>{
                            label: relevantLabel,
                            path: GoogleRepoScannerProvider.DEFAULT_XML_FILE,
                            content: $.xml()
                        }
                    ])
                } else {
                    return Promise.resolve([])
                }
            })))
            const uniqueRefs = DependencyRef.uniqueRefs(allDependencies)
            return Promise.resolve({
                allDependencies: uniqueRefs,
                updates: allUpdates
            })
        } else {
            return Promise.resolve({
                allDependencies: [],
                updates: []
            })
        }
    }
}
