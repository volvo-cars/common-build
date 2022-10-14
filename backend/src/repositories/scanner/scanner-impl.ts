import _ from 'lodash';
import { Refs } from '../../domain-model/refs';
import { RepositorySource } from '../../domain-model/repository-model/repository-source';
import { DependencyRef } from '../../domain-model/system-config/dependency-ref';
import { Version } from '../../domain-model/version';
import { createLogger, loggerName } from '../../logging/logging-factory';
import { DependencyLookup } from "./dependency-lookup";
import { LabelCriteria } from "./label-criteria";
import { Scanner } from './scanner';

const logger = createLogger(loggerName(__filename))

export class ScannerImpl implements Scanner.Service {
    constructor(private providers: Scanner.Provider[]) { }


    async getDependencies(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef): Promise<Map<DependencyRef.Ref, Version[]>> {
        const allDependencies = (await Promise.all(this.providers.map(provider => { return provider.getDependencies(source, ref) }))).flat()
        const dependencyVersionsStringMap: Map<string, string[]> = new Map()
        allDependencies.forEach(dependency => {
            const serializedDependency = dependency.ref.serialize()
            const serializedVersions = _.uniq(_.concat(dependencyVersionsStringMap.get(serializedDependency) || [], dependency.version.asString()))
            dependencyVersionsStringMap.set(serializedDependency, serializedVersions)
        });
        const dependencyMap: Map<DependencyRef.Ref, Version[]> = new Map()
        for (let depString of Array.from(dependencyVersionsStringMap.keys())) {
            const versions = (dependencyVersionsStringMap.get(depString) || []).map(s => { return Version.create(s) })
            const depRef = DependencyRef.deserialize(depString)
            dependencyMap.set(depRef, versions)
        }
        return dependencyMap

    }

    async scan(source: RepositorySource, ref: Refs.ShaRef | Refs.TagRef, dependencyProvider: DependencyLookup.Provider, labelCriteria: LabelCriteria.Criteria): Promise<Scanner.ScanResult> {
        return Promise.all(this.providers.map(provider => {
            return provider.scan(source, ref, dependencyProvider, labelCriteria)
        })).then(allResults => {

            return _.reduce(allResults, (acc: Scanner.ScanResult, next: Scanner.ScanResult) => {
                return new Scanner.ScanResult(
                    _.union(acc.allDependencies, next.allDependencies),
                    _.union(acc.dependencyUpdates, next.dependencyUpdates)
                )
            }, new Scanner.ScanResult([], []))
        })

    }
}