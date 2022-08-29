import { AxiosError, AxiosResponse } from "axios";
import _ from 'lodash';
import { Refs } from "../../domain-model/refs";
import { RepositoryPath, RepositorySource } from "../../domain-model/repository-model/repository-source";
import { LocalGitCommands } from "../../git/local-git-commands";
import { LocalGitFactory, LocalGitLoadMode } from "../../git/local-git-factory";
import { createLogger, loggerName } from "../../logging/logging-factory";
import { Update, UpdateId } from "../../system/build-system";
import { Http, HttpMethod } from "../../utils/http";
import { VaultService } from "../../vault/vault-service";
import { VaultUtils } from "../../vault/vault-utils";
import { Content, RepositoryAccess } from "./repository-access";


const logger = createLogger(loggerName(__filename))
export abstract class AbstractRepositoryAccess implements RepositoryAccess {

    constructor(private id: string, private host: string, private localGitFactory: LocalGitFactory, private vaultService: VaultService) { }

    protected async createRequest(path: string, method: HttpMethod = HttpMethod.GET, data?: any): Promise<AxiosResponse<any, any>> {

        return this.vaultService.getSecret(`csp/common-build/https-${this.host}`).then(secret => {
            const [user, password] = VaultUtils.splitUserSecret(secret)


            let url = `https://${this.host}/${path}`

            let auth = {
                username: user,
                password: password
            }
            const builder = Http.createRequest(url, method).setAuth(auth)
            if (data) {
                builder.setData(data)
            }
            return builder.execute()
        })
    }

    getFile(repository: RepositoryPath, path: string, ref: Refs.Ref): Promise<string | null> {
        return this.localGitFactory.execute(new RepositorySource(this.id, repository), LocalGitCommands.getFile(path, ref), LocalGitLoadMode.CACHED)
    }


    updateBranch(repository: string, ref: Refs.BranchRef, contents: LocalGitCommands.Content[]): Promise<void> {
        return this.localGitFactory.execute(new RepositorySource(this.id, repository), LocalGitCommands.updateBranch(ref, contents), LocalGitLoadMode.CACHED)
    }


    abstract rebase(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.ShaRef | null>

    abstract merge(repository: RepositoryPath, updateId: UpdateId): Promise<Refs.Branch>

    getBranchesAndTags(repository: string): Promise<(Refs.Tag | Refs.Branch)[]> {
        return this.localGitFactory.execute(new RepositorySource(this.id, repository), LocalGitCommands.getBranchesAndTags(), LocalGitLoadMode.CACHED)
    }

    async getBranches(repository: RepositoryPath): Promise<Refs.Branch[]> {
        return this.getBranchesAndTags(repository).then(entities => {
            return entities.filter(e => { return e instanceof Refs.Branch })
        })
    }

    getBranch(repository: RepositoryPath, name: string): Promise<Refs.Branch | undefined> {
        return this.getBranches(repository).then(branches => {
            return branches.find(b => { return b.ref.name === name })
        })
    }

    abstract createBranch(repository: string, fromSha: Refs.ShaRef, name: string): Promise<Refs.Branch>

    getTags(repository: RepositoryPath): Promise<Refs.Tag[]> {
        return this.getBranchesAndTags(repository).then(entities => {
            return entities.filter(e => { return e instanceof Refs.Tag })
        })
    }

    getTag(repository: RepositoryPath, name: string): Promise<Refs.Tag | undefined> {
        return this.getTags(repository).then(tags => {
            return tags.find(t => { return t.ref.name === name })
        })
    }

    abstract createTag(repository: RepositoryPath, sha: Refs.ShaRef, name: string, message?: string): Promise<Refs.Tag>

    abstract getUpdates(repository: RepositoryPath): Promise<Update[]>

    abstract createUpdate(repository: RepositoryPath, target: Refs.BranchRef, labels: string[], ...content: Content[]): Promise<UpdateId>

    abstract updateUpdate(repository: RepositoryPath, updateId: UpdateId, ...content: Content[]): Promise<void>
}



