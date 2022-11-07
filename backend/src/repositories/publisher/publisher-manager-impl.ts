import { ArtifactoryFactory } from "../../artifact-storage/artifactory/artifactory-factory";
import { ArtifactoryDockerRegistryFactory } from "../../artifact-storage/docker/artifactory-docker-registry-factory";
import { Refs } from "../../domain-model/refs";
import { RepositorySource } from "../../domain-model/repository-model/repository-source";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { Version } from "../../domain-model/version";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { SystemFilesAccess } from "../system-files-access";
import { PublicationRepositoryMetaDataKeys, PublisherManager } from "./publisher-manager";


const logger = createLogger(loggerName(__filename))



export class PublisherManagerImpl implements PublisherManager {
    constructor(private systemFilesAccess: SystemFilesAccess, private artifactoryFactory: ArtifactoryFactory, private dockerRegistryFactory: ArtifactoryDockerRegistryFactory) { }

    addMetaData(source: RepositorySource, ref: Refs.ShaRef): Promise<void> {
        return this.systemFilesAccess.getPublicationConfig(source, ref).then(config => {
            if (config) {
                const handleArtifacts = (): Promise<DependencyRef.ArtifactRef[]> => {
                    const artifacts = config.artifacts
                    if (artifacts) {
                        const items = artifacts.items || []
                        return Promise.all(items.map(item => {
                            const artifactRef = new DependencyRef.ArtifactRef(item.remote || artifacts.remote, item.repository || artifacts.repository, item.path)
                            const record: Record<string, string> = {}
                            Array.from((item.properties || new Map<string, string>()).entries()).forEach(([k, v]) => {
                                record[k] = v
                            })
                            record[PublicationRepositoryMetaDataKeys.id] = source.asString()
                            const artifactory = this.artifactoryFactory.get(artifactRef.remote)
                            return artifactory.addArtifactProperties(artifactRef.repository, item.path, ref.sha, record)
                                .catch(e => {
                                    return Promise.reject(new Error(`Failed to publish meta-data for artifact ${artifactRef} in ${ref.name}: ${e}`))
                                }).then(() => {
                                    return artifactRef
                                })
                        }))
                    } else {
                        return Promise.resolve([])
                    }
                }

                const handleImages = (): Promise<DependencyRef.ImageRef[]> => {
                    const images = config.images
                    if (images) {
                        logger.warn("Images does not support meta data.")
                        return Promise.resolve([])
                    } else {
                        return Promise.resolve([])
                    }
                }
                return Promise.all([handleArtifacts(), handleImages()]).then(([artifactRefs, imageRefs]) => {
                    logger.info(`Added meta-data to ${artifactRefs.join(", ")} ${imageRefs.join(", ")}`)
                    return Promise.resolve()
                })
            } else {
                return Promise.resolve()
            }
        })
    }

    publish(refs: DependencyRef.Ref[], sha: Refs.ShaRef, version: Version): Promise<boolean[]> {

        return Promise.all(refs.map(ref => {
            if (ref instanceof DependencyRef.ArtifactRef) {
                return this.publishArtifact(ref, sha, version).then(() => { return true })
            } else if (ref instanceof DependencyRef.ImageRef) {
                return this.publishImage(ref, sha, version).then(() => { return true })
            } else {
                return Promise.resolve(false)
            }
        }))
    }

    private publishArtifact(ref: DependencyRef.ArtifactRef, sha: Refs.ShaRef, version: Version): Promise<void> {
        logger.debug(`Publishing ${version.asString()} of ${ref.toString()} for ${sha}`)
        const artifactory = this.artifactoryFactory.get(ref.remote)
        return artifactory.copy(ref.repository, ref.path, sha.sha, version.asString())
    }

    private publishImage(ref: DependencyRef.ImageRef, sha: Refs.ShaRef, version: Version): Promise<void> {
        logger.debug(`Publishing ${version.asString()} of ${ref.toString()} for ${sha}`)
        const dockerRegistry = this.dockerRegistryFactory.get(ref.remote)
        if (dockerRegistry) {
            return dockerRegistry.copy(ref.repository, sha.sha, version.asString())
        } else {
            return Promise.reject(new Error(`Can not publish docker-image to ${ref.remote}. Missing configuration.`))
        }
    }

    publications(source: RepositorySource, ref: Refs.Ref): Promise<DependencyRef.Ref[]> {
        return this.systemFilesAccess.getPublicationConfig(source, ref).then(publishConfig => {
            if (publishConfig) {
                const artifactsConfig = publishConfig.artifacts
                const artifacts = artifactsConfig ? artifactsConfig.items.map((artifact, index) => {
                    const repository = artifact.repository || artifactsConfig.repository
                    if (!repository) {
                        throw new Error(`Missing repository for artifact[${index}]`)
                    }
                    const remote = artifact.remote || artifactsConfig.remote
                    if (!remote) {
                        throw new Error(`Missing remote for artifact[${index}]`)
                    }
                    return new DependencyRef.ArtifactRef(remote, repository, artifact.path)
                }) : []
                const imageConfig = publishConfig.images
                const images = imageConfig ? (imageConfig.items || []).map((image, index) => {

                    const remote = image.remote || imageConfig.remote
                    if (!remote) {
                        throw new Error(`Missing remote for image[${index}]`)
                    }
                    return new DependencyRef.ImageRef(remote, image.name)
                }) : []
                const allPublications = [artifacts, images].flat()
                logger.debug(`Found ${allPublications.length} publications for ${source} in ${ref}: ${artifacts.map(a => { return `${a.remote}/${a.path}` }).join(",")} ${images.map(a => { return `${a.remote}/${a.repository}` }).join(",")}`)
                return allPublications
            } else {
                logger.debug(`No publications for ${source} in ${ref}`)
                return Promise.resolve([])
            }
        })
    }
}
