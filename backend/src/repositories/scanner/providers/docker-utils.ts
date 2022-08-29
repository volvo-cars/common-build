export namespace DockerUtils {
    const fromRegExp = /^\s*?FROM\s+?([:\d\w_\-\.\/]+)/i
    export const findFrom = (dockerFileContent: string): string | undefined => {
        if (dockerFileContent) {
            const m = dockerFileContent.match(fromRegExp)
            if (m) {
                return m[1]
            }
        }
    }
}