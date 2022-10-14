import { Version } from "../../domain-model/version";
import { DependencyRef } from "../../domain-model/system-config/dependency-ref";
import _ from "lodash"
import { ScannerManager } from "./scanner-manager";
import { GraphTree } from "./scanner-manager-impl";
export class DependencyGraphImpl implements ScannerManager.DependencyGraph {
    constructor(private graphs: GraphTree[]) { }
    getProblems(): ScannerManager.DependencyProblem[] {
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
        const allProblems: ScannerManager.DependencyProblem[] = []
        for (let [serializedRef, serializedVersions] of allVersionsByRef) {
            const uniqueVersions = _.uniq(serializedVersions)
            if (uniqueVersions.length > 1) {
                const versions = uniqueVersions.map(v => { return Version.create(v) })
                allProblems.push(new ScannerManager.MultipleVersionsProblem(DependencyRef.deserialize(serializedRef), versions))
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




