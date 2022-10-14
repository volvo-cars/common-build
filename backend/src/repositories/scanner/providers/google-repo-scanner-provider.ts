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
import { DependencyLookup } from '../dependency-lookup';
import { LabelCriteria } from '../label-criteria';
import { Scanner } from '../scanner';

import { RevisionUtil } from './revision-util';

const logger = createLogger(loggerName(__filename))

export class GoogleRepoScannerProvider implements Scanner.Provider {
    private static DEFAULT_XML_FILE = "default.xml"

    constructor(private repositoryAccessFactory: RepositoryAccessFactory, private sources: ServiceConfig.SourceService[]) { }

    async getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Scanner.Dependency[]> {
        const defaultXml = await this.repositoryAccessFactory.createAccess(source.id).getFile(source.path, GoogleRepoScannerProvider.DEFAULT_XML_FILE, ref)
        if (defaultXml) {
            const $ = cheerio.load(defaultXml, {
                xmlMode: true
            })

            const defaultRemoteName = $("default").attr("remote")

            const extractor = DefaulXmlExtractor.Extractor.createFromXml($)
            const extracts = extractor.extract()

            const allDependencies: Scanner.Dependency[] = []
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
                                allDependencies.push(new Scanner.Dependency(
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



    async scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<Scanner.ScanResult> {
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
                let replaces: Promise<boolean>[] = []
                $("project").each((n, elem) => {
                    const item = $(elem)
                    const name = item.attr("name")
                    const dependencyRevision = item.attr("revision") || defaultRevision
                    const dependencyRemoteName = item.attr("remote") || defaultRemoteName || ""
                    const dependencyRemote = extracts.find(e => { return e.name === dependencyRemoteName })
                    if (dependencyRemote) {
                        if (name) {
                            const projectLabels = splitAndFilter(item.attr("label") || item.attr("labels") || LabelCriteria.DEFAULT_LABEL_NAME)
                            const process = _.includes(projectLabels, relevantLabel)
                            if (process) {
                                let trimmedName = name.replace(/\.git$/i, "")
                                if (dependencyRemote.path) {
                                    trimmedName = [dependencyRemote.path, trimmedName].join("/")
                                }
                                const sourceConfig = this.findSource(dependencyRemote)
                                if (sourceConfig) {
                                    replaces.push(new Promise<boolean>((resolve, reject) => {
                                        const dependencyRef = new DependencyRef.GitRef(new RepositorySource(sourceConfig.id, trimmedName))
                                        allDependencies.push(dependencyRef)
                                        const validDependencyVersion = dependencyRevision ? RevisionUtil.extractVersion(dependencyRevision) : undefined
                                        if (validDependencyVersion) {
                                            dependencyProvider.getVersion(dependencyRef, validDependencyVersion).then(newVersion => {
                                                if (newVersion && newVersion.compare(validDependencyVersion) !== 0) {
                                                    item.attr("revision", RevisionUtil.encodeVersion(newVersion))
                                                    resolve(true)
                                                } else {
                                                    resolve(false)
                                                }
                                            }).catch(e => {
                                                logger.error(`Failed to scan ${source}/${ref}: ${e}`)
                                                console.error(e)
                                                resolve(false)
                                            })
                                        } else {
                                            resolve(false)
                                        }
                                    }))
                                }
                            }
                        }
                    } else {
                        logger.warn(`Missing remote host mapping for ${defaultRemoteName} in ${extracts.map(e => { return `${e.name}=${e.host}` }).join(",")} ${source}/${ref.name} ${name}/${dependencyRevision}`)
                    }
                })
                return Promise.all(replaces).then(replaceResult => {
                    if (_.includes(replaceResult, true)) {
                        const newContent = $.xml()
                        return [
                            new Scanner.DependencyUpdate(
                                relevantLabel,
                                GoogleRepoScannerProvider.DEFAULT_XML_FILE,
                                newContent
                            )
                        ]
                    } else {
                        return []
                    }
                })
            })))
            const uniqueRefs = DependencyRef.uniqueRefs(allDependencies)
            return Promise.resolve(new Scanner.ScanResult(uniqueRefs, allUpdates))
        } else {
            return Promise.resolve(new Scanner.ScanResult([], []))
        }
    }
}
