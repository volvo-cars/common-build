import _ from 'lodash';
import { Refs } from '../../domain-model/refs';
import { RepositorySource } from '../../domain-model/repository-model/repository-source';
import { DependencyRef } from '../../domain-model/system-config/dependency-ref';
import { Version } from '../../domain-model/version';
import { createLogger, loggerName } from '../../logging/logging-factory';
import { DependencyLookupProvider } from './dependency-lookup-provider';
import { DependencyProviderImpl } from "./dependency-provider";
import { LabelCriteria } from "./label-criteria";
import { Scanner, ScanResult } from "./scanner";
import { ScannerProvider } from "./scanner-provider";

const logger = createLogger(loggerName(__filename))

export class ScannerImpl implements Scanner {
    constructor(private providers: ScannerProvider[]) { }

    async dependencies(source: RepositorySource, ref: Refs.Ref): Promise<Map<DependencyRef.Ref, Version[]>> {
        const allDependencies = (await Promise.all(this.providers.map(provider => { return provider.dependencies(source, ref) }))).flat()
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

    async scan(source: RepositorySource, major: number | undefined, ref: Refs.ShaRef, dependencyLookupProvider: DependencyLookupProvider, labelCriteria: LabelCriteria.Criteria): Promise<ScanResult> {
        //const branches = await repositoryAccess.getBranches(source.path)
        logger.debug(`Scanning ${source}/${ref.name} (major:${major}) with ${this.providers.length} providers.`)
        const dependencyProvider = new DependencyProviderImpl(major, dependencyLookupProvider)
        const allResults = (await Promise.all(this.providers.map(provider => { return provider.scan(source, ref, dependencyProvider, labelCriteria) })))
        return _.reduce(allResults, (acc: ScanResult, next: ScanResult) => {
            return {
                allDependencies: _.union(acc.allDependencies, next.allDependencies),
                updates: _.union(acc.updates, next.updates)
            }
        }, {
            allDependencies: [],
            updates: []
        })
    }
}