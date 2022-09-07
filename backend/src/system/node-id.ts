export class NodeId {
    constructor(public readonly id: string) { }
    toString(): string {
        return `node:${this.id}`
    }
}