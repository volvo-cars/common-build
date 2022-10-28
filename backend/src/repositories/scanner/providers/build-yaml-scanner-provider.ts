import _ from 'lodash';
import { ImageVersionUtil } from '../../../domain-model/image-version-util';
import { Refs } from '../../../domain-model/refs';
import { RepositorySource } from '../../../domain-model/repository-model/repository-source';
import { BuildConfig } from '../../../domain-model/system-config/build-config';
import { DependencyRef } from '../../../domain-model/system-config/dependency-ref';
import { createLogger, loggerName } from '../../../logging/logging-factory';
import { splitAndFilter } from '../../../utils/string-util';
import { SystemFilesAccess } from '../../system-files-access';
import { DependencyLookup } from '../dependency-lookup';
import { LabelCriteria } from '../label-criteria';
import { Scanner } from "../scanner";
import { DockerUtils } from './docker-utils';
const logger = createLogger(loggerName(__filename))

export namespace BuildYamlScanner {


    export const DEFAULT_TOOL_LABEL = "build-tools"
    export const TOOL_IMAGE = new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-agent")

    export class Provider implements Scanner.Provider {
        constructor(private systemFilesAccess: SystemFilesAccess) { }

        getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Scanner.Dependency[]> {
            return this.systemFilesAccess.getBuildConfig(source, ref).then(async config => {
                if (config) {
                    return Promise.all(config.build.steps.map(step => {
                        if (step instanceof BuildConfig.BuildCompose.Step) {
                            return Promise.all(Array.from(step.nodes.entries()).flatMap(([id, node]) => {
                                const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                                if (imageVersion) {
                                    const imageRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                    return Promise.resolve([new Scanner.Dependency(imageRef, imageVersion.version)])
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
                                            return Promise.resolve([new Scanner.Dependency(imageRef, imageVersion.version)])
                                        } else {
                                            return Promise.resolve([])
                                        }
                                    } else {
                                        logger.warn(`Could not find FROM in docker-file: ${step.file}`)
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
                        const imageVersion = ImageVersionUtil.ImageVersion.parse(config?.toolImage)
                        if (imageVersion) {
                            const toolImageRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                            const dependency = new Scanner.Dependency(toolImageRef, imageVersion.version)
                            return [dependency, dependencies.flat()].flat()
                        } else {
                            return dependencies.flat()
                        }
                    })
                } else {
                    return []
                }
            })
        }

        scan(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<Scanner.ScanResult> {
            return this.systemFilesAccess.getBuildConfig(source, ref).then(async config => {
                if (config) {
                    const allLabels: string[][] = []
                    config.build.steps.forEach(step => {
                        if (step instanceof BuildConfig.BuildCompose.Step) {
                            Array.from(step.nodes.entries()).forEach(([id, node]) => {
                                const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                                if (imageVersion) {
                                    const labels = node.labels || DEFAULT_TOOL_LABEL
                                    allLabels.push(splitAndFilter(labels))
                                }
                            })
                        } else if (step instanceof BuildConfig.BuildDockerBuild.Step) {
                            const labels = step.labels || DEFAULT_TOOL_LABEL
                            allLabels.push(splitAndFilter(labels))
                        }
                    })
                    allLabels.push([DEFAULT_TOOL_LABEL]) // Hard coded since CB toolImage is always present

                    const allDependencies: DependencyRef.Ref[] = []
                    const relevantLabels = labelCriteria.include(allLabels.flat())

                    const allUpdates = _.flatten(await Promise.all(relevantLabels.map(async relevantLabel => {
                        const clonedConfig = _.cloneDeep(config)
                        let replaces: Promise<void>[] = []
                        let dockerFileReplaces: Promise<Scanner.DependencyUpdate | undefined>[] = []
                        let configFileChanges = 0
                        clonedConfig.build.steps.forEach(step => {
                            if (step instanceof BuildConfig.BuildCompose.Step) {
                                Array.from(step.nodes.entries()).forEach(([id, node]) => {
                                    const nodeLabels = splitAndFilter(node.labels || DEFAULT_TOOL_LABEL)
                                    if (_.includes(nodeLabels, relevantLabel)) {
                                        replaces.push(new Promise<void>((resolve, reject) => {
                                            const imageVersion = ImageVersionUtil.ImageVersion.parse(node.image)
                                            if (imageVersion) {
                                                const dependencyRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                                allDependencies.push(dependencyRef)
                                                dependencyProvider.getVersion(dependencyRef, imageVersion.version).then(newVersion => {
                                                    if (newVersion) {
                                                        if (newVersion.compare(imageVersion.version) !== 0) {
                                                            node.image = imageVersion.withVersion(newVersion).asString()
                                                            configFileChanges++
                                                        }
                                                    }
                                                    resolve()
                                                }).catch(e => { resolve(e) })
                                            } else {
                                                resolve()
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
                                                return dependencyProvider.getVersion(dependencyRef, imageVersion.version).then(newVersion => {
                                                    if (newVersion) {
                                                        if (newVersion.compare(imageVersion.version) !== 0) {
                                                            return new Scanner.DependencyUpdate(
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
                        if (relevantLabel === DEFAULT_TOOL_LABEL) {
                            const imageVersion = ImageVersionUtil.ImageVersion.parse(clonedConfig.toolImage)
                            if (imageVersion) {
                                const toolImageRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                allDependencies.push(toolImageRef)
                                replaces.push(new Promise<void>((resolve, reject) => {
                                    const dependencyRef = new DependencyRef.ImageRef(imageVersion.registry, imageVersion.repository)
                                    allDependencies.push(dependencyRef)
                                    dependencyProvider.getVersion(dependencyRef, imageVersion.version).then(newVersion => {
                                        if (newVersion) {
                                            if (newVersion.compare(imageVersion.version) !== 0) {
                                                clonedConfig.toolImage = imageVersion.withVersion(newVersion).asString()
                                                configFileChanges++
                                            }
                                        }
                                        resolve()
                                    }).catch(e => { resolve(e) })
                                }))
                            }
                        }
                        await Promise.all(replaces)
                        const dockerFileDependencies = <Scanner.DependencyUpdate[]>(await Promise.all(dockerFileReplaces)).filter(r => { return r ? true : false })

                        return Promise.resolve([configFileChanges ? [
                            new Scanner.DependencyUpdate(
                                relevantLabel,
                                BuildConfig.FILE_PATH,
                                this.systemFilesAccess.serialize(clonedConfig)
                            )] : [],
                            dockerFileDependencies
                        ].flat())

                    })))
                    const uniqueRefs = DependencyRef.uniqueRefs(allDependencies)
                    return Promise.resolve(new Scanner.ScanResult(uniqueRefs, allUpdates))
                } else {
                    return Promise.resolve(new Scanner.ScanResult([], []))
                }
            })
        }
    }

}



