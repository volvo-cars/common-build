export enum JobRefType {
    UPDATE = "update",
    BRANCH = "branch"
}

export class JobRef {
    readonly type: JobRefType
    readonly ref: string
    private constructor(type: JobRefType, ref: string) {
        this.type = type
        this.ref = ref
    }

    static create(type: JobRefType, ref: string): JobRef {
        return new JobRef(type, ref)
    }

    static deserialize(string: string): JobRef {
        const [type, ref] = string.split(":")
        if (type && ref) {
            if (type === JobRefType.UPDATE) {
                return new JobRef(JobRefType.UPDATE, ref)
            } else if (type === JobRefType.BRANCH) {
                return new JobRef(JobRefType.BRANCH, ref)
            } else {
                throw new Error(`Bad JobRefType: ${type}`)
            }
        } else {
            throw new Error(`Bad JobRef:${string}`)
        }
    }

    serialize(): string {
        return `${this.type}:${this.ref}`
    }
}


