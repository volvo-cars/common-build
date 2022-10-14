export namespace RawModel {

    export type StringSha = { name: string, sha: string }
    export type NumberSha = { number: number, sha: string }
    export type NumbersSha = { numbers: number[], sha: string }

    export type Data = {
        readonly main: StringSha,
        readonly releaseTags: NumbersSha[],
        readonly patchBranches: NumbersSha[],
        readonly majorTags: NumberSha[]
    }
}