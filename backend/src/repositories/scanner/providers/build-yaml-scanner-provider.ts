import _ from 'lodash';
import { ImageVersionUtil } from '../../../domain-model/image-version-util';
import { Refs } from '../../../domain-model/refs';
import { RepositorySource } from '../../../domain-model/repository-model/repository-source';
import { BuildConfig } from '../../../domain-model/system-config/build-config';
import { DependencyRef } from '../../../domain-model/system-config/dependency-ref';
import { createLogger, loggerName } from '../../../logging/logging-factory';
import { splitAndFilter } from '../../../utils/string-util';
import { SystemFilesAccess } from '../../system-files-access';
import { DependencyProvider } from '../dependency-provider';
import { LabelCriteria } from '../label-criteria';
import { DependencyUpdate, ScanResult } from "../scanner";
import { Dependency, ScannerProvider } from "../scanner-provider";
import { DockerUtils } from './docker-utils';
const logger = createLogger(loggerName(__filename))

export class BuildYamlScannerProvider implements ScannerProvider {
    constructor(private systemFilesAccess: SystemFilesAccess) { }

    dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Dependency[]> {
        return this.systemFilesAccess.getBuildConfig(source, ref).then(async config => {
            if (config) {
                return Promise.all(config.build.steps.map(step => {
                    if (step instanceof BuildConfig.BuildCompose.Step) {
                        return Promise.all(Array.from(step.nodes.entries()).flatMap(([id, node]) => {
                            const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                            if (imageVersion) {
                                const imageRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                return Promise.resolve([new Dependency(imageRef, imageVersion.version)])
                            } else {
                                return Promise.resolve([])
                            }
                        })).then(result => {
                            return result.flat()
                        })
                    } else if (step instanceof BuildConfig.BuildDockerBuild.Step) {
                        return this.systemFilesAccess.getFile(source, step.file, ref).then(dockerFileContent => {
                            if (dockerFileContent) {
                                const rawImage = DockerUtils.findFrom(dockerFileContent)
                                if (rawImage) {
                                    const imageVersion = ImageVersionUtil.ImageVersion.parse(rawImage)
                                    if (imageVersion) {
                                        const imageRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                        return Promise.resolve([new Dependency(imageRef, imageVersion.version)])
                                    } else {
                                        return Promise.resolve([])
                                    }
                                } else {
                                    console.warn(`Could not find FROM in docker-file: ${step.file}`)
                                    return Promise.resolve([])
                                }
                            } else {
                                return Promise.resolve([])
                            }
                        })
                    } else {
                        return Promise.resolve([])
                    }
                })).then(dependencies => {
                    return dependencies.flat()
                })
            } else {
                return []
            }
        })
    }

    async scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult> {
        return this.systemFilesAccess.getBuildConfig(source, ref).then(async config => {
            if (config) {
                const allLabels: string[][] = []
                config.build.steps.forEach(step => {
                    if (step instanceof BuildConfig.BuildCompose.Step) {
                        Array.from(step.nodes.entries()).forEach(([id, node]) => {
                            const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                            if (imageVersion) {
                                const labels = node.labels || LabelCriteria.DEFAULT_LABEL_NAME
                                allLabels.push(splitAndFilter(labels))
                            }
                        })
                    } else if (step instanceof BuildConfig.BuildDockerBuild.Step) {
                        const labels = step.labels || LabelCriteria.DEFAULT_LABEL_NAME
                        allLabels.push(splitAndFilter(labels))
                    }
                })

                const allDependencies: DependencyRef.Ref[] = []
                const relevantLabels = labelCriteria.include(_.flatten(allLabels))

                const allUpdates = _.flatten(await Promise.all(relevantLabels.map(async relevantLabel => {
                    const clonedConfig = _.cloneDeep(config)
                    let replaces: Promise<void>[] = []
                    let dockerFileReplaces: Promise<DependencyUpdate | undefined>[] = []
                    let configFileChanges = 0
                    clonedConfig.build.steps.forEach(step => {
                        if (step instanceof BuildConfig.BuildCompose.Step) {
                            Array.from(step.nodes.entries()).forEach(([id, node]) => {
                                const nodeLabels = splitAndFilter(node.labels || LabelCriteria.DEFAULT_LABEL_NAME)
                                if (_.includes(nodeLabels, relevantLabel)) {
                                    replaces.push(new Promise<void>((resolve, reject) => {
                                        const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                                        if (imageVersion) {
                                            const dependencyRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                            allDependencies.push(dependencyRef)
                                            dependencyProvider.getVersion(dependencyRef).then(newVersion => {
                                                if (newVersion) {
                                                    if (newVersion.compare(imageVersion.version) !== 0) {
                                                        node.image = imageVersion.withVersion(newVersion).asString()
                                                        configFileChanges++
                                                    }
                                                }
                                                resolve()
                                            }).catch(e => { resolve(e) })
                                        }
                                    }))
                                }
                            })
                        } else if (step instanceof BuildConfig.BuildDockerBuild.Step) {
                            dockerFileReplaces.push(this.systemFilesAccess.getFile(source, step.file, ref).then(dockerFileContent => {
                                if (dockerFileContent) {
                                    const rawImage = DockerUtils.findFrom(dockerFileContent)
                                    if (rawImage) {
                                        const imageVersion = ImageVersionUtil.ImageVersion.parse(rawImage)
                                        if (imageVersion) {
                                            const dependencyRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                            allDependencies.push(dependencyRef)
                                            return dependencyProvider.getVersion(dependencyRef).then(newVersion => {
                                                if (newVersion) {
                                                    if (newVersion.compare(imageVersion.version) !== 0) {
                                                        return new DependencyUpdate(
                                                            relevantLabel,
                                                            step.file,
                                                            dockerFileContent.replace(rawImage, imageVersion.withVersion(newVersion).asString()))
                                                    } else {
                                                        return undefined
                                                    }
                                                } else {
                                                    return undefined
                                                }
                                            })

                                        } else {
                                            return undefined
                                        }
                                    } else {
                                        return undefined
                                    }
                                } else {
                                    return undefined
                                }
                            }))
                        }

                    })
                    await Promise.all(replaces)
                    const dockerFileDependencies = <DependencyUpdate[]>(await Promise.all(dockerFileReplaces)).filter(r => { return r ? true : false })

                    return Promise.resolve([configFileChanges ? [
                        <DependencyUpdate>{
                            label: relevantLabel,
                            path: BuildConfig.FILE_PATH,
                            content: this.systemFilesAccess.serialize(clonedConfig)
                        }] : [],
                        dockerFileDependencies
                    ].flat())

                })))
                const uniqueRefs = DependencyRef.uniqueRefs(allDependencies)
                return Promise.resolve({
                    allDependencies: uniqueRefs,
                    updates: allUpdates
                })
            } else {
                return Promise.resolve(<ScanResult>{
                    allDependencies: [],
                    updates: []
                })
            }
        })
    }
}


