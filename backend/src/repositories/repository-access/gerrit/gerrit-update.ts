import { Refs } from "../../../domain-model/refs";
import { RepositorySource } from "../../../domain-model/repository-model/repository-source";
import { BranchName, Update, UpdateId, UpdateLabel } from "../../../system/build-system";
import { SourceCache } from "../../../system/source-cache";

export class GerritUpdate extends Update {

    constructor(
        public readonly source: RepositorySource,
        public readonly id: UpdateId,
        public readonly sha: Refs.ShaRef,
        public readonly target: BranchName,
        public readonly title: string,
        public readonly labels: UpdateLabel[],
        public readonly url: string,
        public readonly changeNumber: number
    ) {
        super(source, id, sha, target, title, labels, url)
    }

    get refSpec(): SourceCache.RefSpec {
        const prefix = `${this.changeNumber.toString().slice(-2)}/${this.changeNumber}`
        return new SourceCache.RefSpec(`+refs/changes/${prefix}/*:refs/remotes/origin/changes/${prefix}/*`)
    }
}

