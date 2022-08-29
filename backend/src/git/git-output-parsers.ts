import { Refs } from "../domain-model/refs"

export namespace GitOutputParser {

    const refRegExp = /^([a-f0-9]{40})\s(.*?)(\^\{\})?$/i

    export const parseReferences = (output: string): (Refs.Tag | Refs.Branch)[] => {
        const acc = output.split("\n").filter(s => { return s ? true : false }).reduce((acc, next) => {
            const m = refRegExp.exec(next)
            if (m) {
                const [full, sha, ref, commitRef] = m
                if (commitRef || !acc.get(ref)) {
                    const parsedRef = Refs.tryCreate(ref)
                    if (parsedRef) {
                        const shaRef = Refs.ShaRef.create(sha)
                        if (parsedRef.type === Refs.Type.BRANCH) {
                            acc.set(ref, new Refs.Branch(parsedRef, shaRef))
                        } else if (parsedRef.type === Refs.Type.TAG) {
                            acc.set(ref, new Refs.Tag(parsedRef, shaRef))
                        }
                    }
                }
            }
            return acc
        }, new Map<string, any>()) // To fix
        return Array.from(acc.values())
    }
}