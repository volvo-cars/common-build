import { Version } from "../../../domain-model/version"


export class RevisionUtil {

    private static VERSION_REGEX = /^(?:refs\/tags\/)?v([\.\d]+)$/i

    private constructor() { }

    /**
     * 
     * @param revision 
     */
    static extractVersion(revision: string): Version | null {
        const m = RevisionUtil.VERSION_REGEX.exec(revision)
        if (m && m.length === 2) {
            return Version.parse(m[1])
        } else {
            return null
        }
    }

    static encodeVersion(version: Version): string {
        return `refs/tags/v${version.asString()}`
    }
}


