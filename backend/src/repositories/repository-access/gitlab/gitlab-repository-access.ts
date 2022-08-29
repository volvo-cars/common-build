import { Refs } from "../../../domain-model/refs";
import { RepositoryPath } from "../../../domain-model/repository-model/repository-source";
import { ServiceConfig } from "../../../domain-model/system-config/service-config";
import { LocalGitFactory } from "../../../git/local-git-factory";
import { createLogger, loggerName } from "../../../logging/logging-factory";
import { Update, UpdateId } from "../../../system/build-system";
import { VaultService } from "../../../vault/vault-service";
import { AbstractRepositoryAccess } from "../abstract-repository-access";
import { Content } from "../repository-access";

const logger = createLogger(loggerName(__filename))
export class GitlabRepositoryAccess extends AbstractRepositoryAccess {

    constructor(private config: ServiceConfig.GitlabSourceService, localGitFactory: LocalGitFactory, vaultService: VaultService) {
        super(config.id, config.https, localGitFactory, vaultService)
    }

    async rebase(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.ShaRef | null> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    async merge(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.Branch> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    createBranch(repository: string, fromSha: Refs.ShaRef, name: string): Promise<Refs.Branch> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    createTag(repository: RepositoryPath, sha: Refs.ShaRef, name: string, message?: string): Promise<Refs.Tag> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    getUpdates(repository: RepositoryPath): Promise<Update[]> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    createUpdate(repository: RepositoryPath, target: Refs.BranchRef, labels: string[], ...content: Content[]): Promise<UpdateId> {
        return Promise.reject('Operation not implemented in GitLab access')
    }

    async updateUpdate(repository: RepositoryPath, updateId: UpdateId, ...content: Content[]): Promise<void> {
        return Promise.reject('Operation not implemented in GitLab access')
    }


}

