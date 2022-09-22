import { AxiosError, AxiosResponse } from "axios";
import _ from 'lodash';
import { Refs } from "../../../domain-model/refs";
import { RepositoryPath, RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../../../domain-model/system-config/service-config";
import { LocalGitFactory } from "../../../git/local-git-factory";
import { createLogger, loggerName } from "../../../logging/logging-factory";
import { Update, UpdateId } from "../../../system/build-system";
import { createExecutionSerializer } from "../../../system/execution-serializer";
import { HttpMethod } from "../../../utils/http";
import { StringTypedMap } from "../../../utils/model";
import { encodeReplace } from "../../../utils/string-util";
import { VaultService } from "../../../vault/vault-service";
import { AbstractRepositoryAccess } from "../abstract-repository-access";
import { Content } from "../repository-access";
import { gerritJsonResponseDecode } from "./gerrit-json-response-decoder";

const logger = createLogger(loggerName(__filename))
export class GerritRepositoryAccess extends AbstractRepositoryAccess {

    private executionSerializer = createExecutionSerializer()
    constructor(private config: ServiceConfig.GerritSourceService, localGitFactory: LocalGitFactory, vaultService: VaultService) {
        super(config.id, config.https, localGitFactory, vaultService)
    }

    private createGerritRequest(path: string, method: HttpMethod = HttpMethod.GET, data?: any): Promise<AxiosResponse<any, any>> {
        return this.createRequest(`a/${encodeReplace(path)}`, method, data)
    }

    setValidBuild(repository: RepositoryPath, updateId: UpdateId, ref: Refs.ShaRef): Promise<void> {
        return this.internalSetLabels(updateId, ref, { "Verified": 1 })
    }

    async rebase(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.ShaRef | null> {
        try {
            const update = await this.internalGetChange(updateId)
            // console.log(`GOT UPDATE ${JSON.stringify(update, null, 2)}`)
            if (!update.mergeable) {
                return Promise.reject("Update is not mergeable.")
            }
            const targetBranch = await this.internalGetBranch(repository, update.branch)
            return this.createGerritRequest(`changes/${updateId}/rebase`, HttpMethod.POST, { "base": targetBranch.revision }).then(async response => {
                if (response.status === 200) {
                    const json = <ChangeInfo>(gerritJsonResponseDecode(response.data))
                    return Promise.resolve(Refs.ShaRef.create(json.current_revision))
                } else {
                    return Promise.reject(new Error(`Error while rebasing [${response.status}] ${updateId}`)) // Other error
                }
            }).catch(async (error: AxiosError) => {
                if (error.response?.status === 409) {
                    return Promise.resolve(null) // 409 in when mergeable==true means no-rebase needed.
                } else {
                    return Promise.reject(error)
                }
            })
        } catch (e) {
            logger.error(`REBASING! ERROR: ${e}`)
            return Promise.reject(e)
        }
    }

    async merge(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.Branch> {
        const update = await this.internalGetChange(updateId)
        const availableLabels = await this.internalGetProjectLabels(repository)
        const labelsToSet = availableLabels.reduce((acc: Record<string, number>, next: LabelDefinitionInfo) => {
            const labelName = next.name
            const highestValue = _.max(Object.keys(next.values).map(v => { return parseInt(v) }))
            if (highestValue !== undefined) {
                acc[labelName] = highestValue
            }
            return acc
        }, {})

        await this.internalSetLabels(updateId, Refs.ShaRef.create(update.current_revision), labelsToSet)
        return this.createGerritRequest(`changes/${updateId}/submit`, HttpMethod.POST, null).then(async response => {
            if (response.status === 200) {
                const changeInfo = <ChangeInfo>gerritJsonResponseDecode(response.data)
                //No updated revision in changeInfo
                const updatedBranch = await this.internalGetBranch(repository, changeInfo.branch)
                if (updatedBranch.revision !== update.current_revision) {
                    logger.warn(`Update commit ${update.current_revision}!= ${updatedBranch.revision} in ${repository} ${updateId} for ${update.branch}`)
                }
                const branch = Refs.Branch.create(`refs/heads/${changeInfo.branch}`, updatedBranch.revision)
                return Promise.resolve(branch)
            } else {
                return Promise.reject(new Error(`Error while rebasing [${response.status}] ${updateId}`)) // Other error
            }
        }).catch((error: AxiosError) => {
            logger.error(`Could not merge update ${updateId}: ${error.response?.status} ${error.response?.data}`)
            return Promise.reject(error)
        })
    }

    createBranch(repository: string, fromSha: Refs.ShaRef, name: string): Promise<Refs.Branch> {
        return this.createGerritRequest(`projects/{${repository}}/branches/{${name}}`, HttpMethod.PUT, {
            revision: fromSha.sha
        }).then(response => {
            if (response.status === 201) {
                return Promise.resolve(Refs.Branch.createWithSha(`refs/heads/${name}`, fromSha))
            } else {
                return Promise.reject(new Error(`Could not create branch ${name} for ${fromSha} ${response.status}`))
            }
        })
    }

    createTag(repository: RepositoryPath, sha: Refs.ShaRef, name: string, message?: string): Promise<Refs.Tag> {
        return this.createGerritRequest(`projects/{${repository}}/tags/{${name}}`, HttpMethod.PUT, {
            message: message || "Action by CommonBuild",
            revision: sha.sha
        }).then(response => {
            if (response.status === 201) {
                const tagInfo = <TagInfo>gerritJsonResponseDecode(response.data)
                if (tagInfo.object) {
                    return Promise.resolve(Refs.Tag.create(`refs/tags/${name}`, tagInfo.object))
                } else {
                    return Promise.reject(`Created tag was not annotated for tag ${name}`)
                }
            } else {
                return Promise.reject(new Error(`Could not create tag ${name} for ${sha} ${response.status}`))
            }
        })
    }

    getUpdates(repository: RepositoryPath): Promise<Update[]> {

        return this.createGerritRequest(`changes/?q=status:open+project:{${repository}}&o=CURRENT_REVISION`).then(response => {
            if (response.status === 200) {
                const changes = <ChangeInfo[]>gerritJsonResponseDecode(response.data)
                return changes.map(change => new Update(
                    new RepositorySource(this.config.id, repository),
                    change.change_id,
                    Refs.ShaRef.create(change.current_revision),
                    change.branch,
                    change.subject,
                    change.hashtags || [],
                    change._number
                ))
            } else {
                return Promise.reject(new Error(`Could not fetch updates from ${this.config.id}/${repository}: ${response.status}`))
            }
        })
    }

    createUpdate(repository: RepositoryPath, target: Refs.BranchRef, labels: string[], ...content: Content.Content[]): Promise<UpdateId> {
        return this.createGerritRequest(`changes/`, HttpMethod.POST, {
            project: repository,
            subject: `CommonBuild update: ${_.take(content, 5).map(c => { return c.path }).join(",")}`,
            branch: target.name,
            status: "NEW",
            is_private: true
        }).then(async response => {
            if (response.status === 201) {
                let change = <ChangeInfo>gerritJsonResponseDecode(response.data)
                return this.internalSetHashTags(change.change_id, labels).then(() => {
                    return this.createGerritRequest(`changes/${change.change_id}/private`, HttpMethod.DELETE).then(() => {
                        return this.internalUpsertFileContent(change.change_id, content).then(() => {
                            return change.change_id
                        })
                    })
                })
            } else {
                return Promise.reject(new Error(`Could not create update to ${target.name} in ${this.config.id}/${repository} ${response.status}`))
            }
        }).catch((error: AxiosError) => {
            return Promise.reject(`Could not create update on ${this.config.id}/${repository}: ${error.response?.status} ${error}`)
        })
    }

    async updateUpdate(repository: RepositoryPath, updateId: UpdateId, ...content: Content.Content[]): Promise<void> {
        return this.internalUpsertFileContent(updateId, content)
    }

    private async internalGetProjectLabels(repository: RepositoryPath): Promise<LabelDefinitionInfo[]> {
        return this.createGerritRequest(`projects/{${repository}}/labels?inherited`, HttpMethod.GET, null).then(async response => {
            if (response.status === 200) {
                const labelInfos = <LabelDefinitionInfo[]>gerritJsonResponseDecode(response.data)
                return Promise.resolve(labelInfos)
            } else {
                return Promise.reject(new Error(`Error while fetching available labels from [${repository}]`)) // Other error
            }
        }).catch((error: AxiosError) => {
            logger.error(`Could not fetch labels on ${repository}: ${error.response?.status} ${error.response?.data}`)
            return Promise.reject(error)
        })
    }

    async internalUpsertFileContent(updateId: UpdateId, content: Content.Content[]): Promise<void> {
        const cmd = async () => {
            return Promise.all(content.map(c => {
                return this.createGerritRequest(`changes/${updateId}/edit/{${c.path}}`, HttpMethod.PUT, {
                    binary_content: `data:text/plain;base64,${c.content().toString("base64")}`
                }).then((response) => {
                    return Promise.resolve(true)
                }).catch((error: AxiosError) => {
                    if (error.response?.status === 409) {
                        return Promise.resolve(false)
                    } else {
                        return Promise.reject(error)
                    }
                })
            })).then(updates => {
                if (_.includes(updates, true)) {
                    return this.createGerritRequest(`changes/${updateId}/edit:publish`, HttpMethod.POST, {
                        "notify": "NONE"
                    }).then(() => { return })
                } else {
                    return Promise.resolve()
                }
            })
        }
        return this.executionSerializer.execute("upsert-content", cmd)
    }

    async internalSetHashTags(updateId: UpdateId, tags: string[]): Promise<void> {
        if (tags.length) {
            return this.createGerritRequest(`changes/${updateId}/hashtags`, HttpMethod.POST, {
                add: tags,
                remove: []
            }).then(response => {
                if (response.status === 200) {
                    return Promise.resolve()
                } else {
                    return Promise.reject(new Error(`Could not set labels: ${response.status}`))
                }
            })
        } else {
            return Promise.resolve()
        }
    }

    async internalSetLabels(updateId: UpdateId, revision: Refs.ShaRef, labels: StringTypedMap<number>): Promise<void> {
        return this.createGerritRequest(`changes/${updateId}/revisions/${revision.sha}/review`, HttpMethod.POST, {
            message: "Added by common-build",
            labels: labels
        }).then(response => {
            if (response.status === 200) {
                return Promise.resolve()
            } else {
                return Promise.reject(new Error(`Could not set labels: ${response.status}`))
            }
        })
    }

    async internalGetChangeByChangeNr(changeNumber: number): Promise<ChangeInfo> {
        return this.createGerritRequest(`changes/?q=change:${changeNumber}`).then(response => {
            if (response.status === 200) {
                const json = gerritJsonResponseDecode(response.data)
                return (<ChangeInfo>(json[0]))
            } else {
                return Promise.reject(new Error(`Could not fetch changeNr[${changeNumber}]: ${response.status}`))
            }
        })
    }

    async internalGetChange(updateId: UpdateId): Promise<ChangeInfo> {
        return this.createGerritRequest(`changes/${updateId}?o=CURRENT_REVISION`).then(response => {
            if (response.status === 200) {
                const change = <ChangeInfo>gerritJsonResponseDecode(response.data)
                return change
            } else {
                return Promise.reject(new Error(`Could not fetch ChangeId[${updateId}]: ${response.status}`))
            }
        })
    }

    async internalGetBranch(repository: RepositoryPath, branch: string): Promise<BranchInfo> {
        return this.createGerritRequest(`projects/{${repository}}/branches/${branch}`).then(response => {
            if (response.status === 200) {
                return Promise.resolve(<BranchInfo>gerritJsonResponseDecode(response.data))
            } else {
                return Promise.reject(new Error(`Error while fetching branch: ${branch} [${response.status}]`)) // Other error
            }
        })
    }
}

export type TagInfo = {
    ref: string
    revision: string,
    object?: string
    message?: string
}

export type ChangeInfo = {
    current_revision: string
    branch: string
    subject: string
    mergeable: boolean
    change_id: string
    status: ChangeInfoStatus,
    labels?: Record<string, LabelInfo>,
    hashtags?: string[],
    is_private?: boolean,
    _number: number
}

export enum ChangeInfoStatus {
    NEW = "NEW",
    MERGED = "MERGED",
    ABANDONED = "ABANDONED"
}

export type BranchInfo = {
    ref: string
    revision: string
}

export type LabelInfo = {

}

export type LabelDefinitionInfo = {
    name: string,
    project: string,
    values: Record<string, string>
}

