import _ from 'lodash';
import { Refs } from '../../../domain-model/refs';
import { RepositorySource } from '../../../domain-model/repository-model/repository-source';
import { DependenciesConfig } from '../../../domain-model/system-config/dependencies-config';
import { DependencyRef } from '../../../domain-model/system-config/dependency-ref';
import { Version } from '../../../domain-model/version';
import { createLogger, loggerName } from '../../../logging/logging-factory';
import { splitAndFilter } from '../../../utils/string-util';
import { SystemFilesAccess } from '../../system-files-access';
import { DependencyLookup } from '../dependency-lookup';
import { LabelCriteria } from '../label-criteria';
import { Scanner } from '../scanner';
const logger = createLogger(loggerName(__filename))

export class DependenciesYamlScannerProvider implements Scanner.Provider {
    constructor(private systemFilesAccess: SystemFilesAccess) { }


    getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Scanner.Dependency[]> {
        return this.systemFilesAccess.getDependenciesConfig(source, ref).then(async config => {
            if (config) {
                const artifactsConfig = config.artifacts
                const artifactDependencies = artifactsConfig ? artifactsConfig.items.flatMap(artifact => {
                    const remote = artifact.remote || artifactsConfig.remote
                    const repository = artifact.repository || artifactsConfig.repository
                    const version = Version.parse(artifact.revision)
                    if (remote && repository && version) {
                        const dependencyRef = new DependencyRef.ArtifactRef(remote, repository, artifact.path)
                        return [new Scanner.Dependency(dependencyRef, version)]

                    } else {
                        return []
                    }
                }) : []
                const imagesConfig = config.images
                const imageDependencies = imagesConfig ? imagesConfig.images.flatMap(image => {
                    const remote = image.remote || imagesConfig.remote
                    const version = Version.parse(image.revision)
                    if (remote && version) {
                        const dependencyRef = new DependencyRef.ImageRef(remote, image.repository)
                        return [new Scanner.Dependency(dependencyRef, version)]

                    } else {
                        return []
                    }
                }) : []


                return [artifactDependencies, imageDependencies].flat()

            } else {
                return []
            }
        })
    }

    async scan(source: RepositorySource, ref: Refs.Ref, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<Scanner.ScanResult> {
        return this.systemFilesAccess.getDependenciesConfig(source, ref).then(async config => {
            if (config) {
                const allLabels: string[][] = []
                const artifactsConfig = config.artifacts
                if (artifactsConfig) {
                    artifactsConfig.items.forEach(artifact => {
                        const labels = artifact.labels || LabelCriteria.DEFAULT_LABEL_NAME
                        allLabels.push(splitAndFilter(labels))
                    })
                }
                const imagesConfig = config.images
                if (imagesConfig) {
                    imagesConfig.images.forEach(image => {
                        const labels = image.labels || LabelCriteria.DEFAULT_LABEL_NAME
                        allLabels.push(splitAndFilter(labels))
                    })
                }

                const allDependencies: DependencyRef.Ref[] = []
                const relevantLabels = labelCriteria.include(_.flatten(allLabels))

                const allUpdates = _.flatten(await Promise.all(relevantLabels.map(async relevantLabel => {
                    const clonedConfig = _.cloneDeep(config)
                    let replaces: Promise<void>[] = []
                    let changeCount = 0
                    const clonedArtifactsConfig = clonedConfig.artifacts
                    if (clonedArtifactsConfig) {
                        clonedArtifactsConfig.items.forEach(artifact => {
                            const artifactLabels = splitAndFilter(artifact.labels || LabelCriteria.DEFAULT_LABEL_NAME)
                            if (_.includes(artifactLabels, relevantLabel)) {
                                replaces.push(new Promise<void>((resolve, reject) => {
                                    const remote = artifact.remote || clonedArtifactsConfig.remote
                                    const repository = artifact.repository || clonedArtifactsConfig.repository
                                    if (remote && repository) {
                                        const dependencyRef = new DependencyRef.ArtifactRef(remote, repository, artifact.path)
                                        allDependencies.push(dependencyRef)
                                        const currentVersion = Version.parse(artifact.revision || "")
                                        if (currentVersion) {
                                            dependencyProvider.getVersion(dependencyRef, currentVersion).then(newVersion => {
                                                if (newVersion) {
                                                    if (!currentVersion || newVersion.compare(currentVersion) !== 0) {
                                                        artifact.revision = newVersion.asString()
                                                        changeCount++
                                                    }
                                                }
                                            }).finally(() => { resolve() })
                                        } else {
                                            resolve()
                                        }
                                    } else {
                                        resolve()
                                    }
                                }))
                            }
                        })
                    }
                    const clonedImagesConfig = clonedConfig.images
                    if (clonedImagesConfig) {
                        clonedImagesConfig.images.forEach(image => {
                            const artifactLabels = splitAndFilter(image.labels || LabelCriteria.DEFAULT_LABEL_NAME)
                            if (_.includes(artifactLabels, relevantLabel)) {
                                replaces.push(new Promise<void>((resolve, reject) => {
                                    const remote = image.remote || clonedImagesConfig.remote
                                    if (remote) {
                                        const dependencyRef = new DependencyRef.ImageRef(remote, image.repository)
                                        allDependencies.push(dependencyRef)
                                        const currentVersion = Version.parse(image.revision || "")
                                        if (currentVersion) {
                                            dependencyProvider.getVersion(dependencyRef, currentVersion).then(newVersion => {
                                                if (newVersion && newVersion.compare(currentVersion) !== 0) {
                                                    image.revision = newVersion.asString()
                                                    changeCount++
                                                }
                                                resolve()
                                            }).catch(e => { resolve(e) })
                                        } else {
                                            resolve()
                                        }
                                    } else {
                                        resolve()
                                    }
                                }))
                            }
                        })
                    }


                    await Promise.all(replaces)
                    if (changeCount) {
                        return Promise.resolve([
                            new Scanner.DependencyUpdate(
                                relevantLabel,
                                DependenciesConfig.FILE_PATH,
                                this.systemFilesAccess.serialize(clonedConfig)
                            )
                        ])
                    } else {
                        return Promise.resolve([])
                    }

                })))
                const uniqueRefs = DependencyRef.uniqueRefs(allDependencies)
                return Promise.resolve(new Scanner.ScanResult(uniqueRefs, allUpdates))
            } else {
                return Promise.resolve(new Scanner.ScanResult([], []))
            }
        })
    }
}

