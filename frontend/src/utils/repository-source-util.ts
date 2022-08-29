import { RepositorySource } from "../domain-model/repository-model/repository-source"

const serverDelimiter = '/'
const webDelimiter = '.'
export class RepositorySourceUtil {
    private constructor() { }

    static serialize(source: RepositorySource): string {
        return `${source.id}${webDelimiter}${source.path.split(serverDelimiter).join(webDelimiter)}`
    }
    static deserialize(serialized: string): RepositorySource | undefined {
        const [id, ...segments] = serialized.split(webDelimiter)
        if (id && segments.length > 0) {
            return new RepositorySource(id, segments.join(serverDelimiter))
        }
    }

    static repositoryUrl(source: RepositorySource): string {
        if (source.id === "csp-gerrit") {
            return `https://csp-gerrit.volvocars.biz/plugins/gitiles/${source.path}`
        } else if (source.id === "csp-gerrit-qa") {
            return `https://csp-gerrit-qa.volvocars.biz/plugins/gitiles/${source.path}`
        }
        throw new Error(`Unknown repository-source:${source.id}`)
    }

    static repositoryBranchUrl(source: RepositorySource, branchName: string): string {
        return `${this.repositoryUrl(source)}/+/refs/heads/${branchName}`
    }
    static repositoryTagUrl(source: RepositorySource, tagName: string): string {
        return `${this.repositoryUrl(source)}/+/refs/tags/${tagName}`
    }

}