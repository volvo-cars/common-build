import { Version } from "../../domain-model/version";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import { DependencyGraph, DependencyGraphProblem, GraphTree } from "./scanner-manager";
import _ from "lodash"
export class DependencyGraphImpl implements DependencyGraph {
    constructor(private graphs: GraphTree[]) { }
    getProblems(): DependencyGraphProblem.Problem[] {
        const allVersionsByRef: Map<string, string[]> = new Map()
        const traverseGraph = (graph: GraphTree): void => {
            const serializedRef = graph.ref.serialize()
            const allVersions = _.concat(allVersionsByRef.get(serializedRef) || [], graph.version.asString())
            allVersionsByRef.set(serializedRef, allVersions)
            graph.dependencies.forEach(graph => {
                traverseGraph(graph)
            })
        }
        this.graphs.forEach(graph => {
            traverseGraph(graph)
        })
        const allProblems: DependencyGraphProblem.Problem[] = []
        for (let [serializedRef, serializedVersions] of allVersionsByRef) {
            const uniqueVersions = _.uniq(serializedVersions)
            if (uniqueVersions.length > 1) {
                const versions = uniqueVersions.map(v => { return Version.create(v) })
                allProblems.push(<DependencyGraphProblem.MultipleVersions>{
                    type: DependencyGraphProblem.Type.MULTIPLE_VERSIONS,
                    ref: DependencyRef.deserialize(serializedRef),
                    versions: versions,
                    asString: (): string => { return `Dependency ${serializedRef} in multiple different versions: ${uniqueVersions.join(", ")}` }
                })
            }
        }
        return allProblems
    }

    traverse(visitor: (ref: DependencyRef.Ref, version: Version, depth: number) => void): void {
        const traverseGraph = (graph: GraphTree, depth: number): void => {
            visitor(graph.ref, graph.version, depth)
            graph.dependencies.forEach(graph => {
                traverseGraph(graph, depth + 1)
            })
        }
        this.graphs.forEach(graph => {
            traverseGraph(graph, 0)
        })

    }
}




