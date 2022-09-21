export namespace ActiveSystemUtil {
    export const isRepositoryOnCurrentSystem = (repositorySystem: string | undefined, defaultSystem: string, currentSystem: string): boolean => {
        return (repositorySystem || defaultSystem) === currentSystem
    }
}