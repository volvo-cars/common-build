import { describe, expect, it } from '@jest/globals'
import { Version } from "../../../../../src/domain-model/version"
import { DependencyLookup } from '../../../../../src/repositories/scanner/dependency-lookup'
import { DependencyRef } from "../../../../../src/domain-model/system-config/dependency-ref"
import { LabelCriteria } from "../../../../../src/repositories/scanner/label-criteria"
import { DependenciesYamlScannerProvider } from '../../../../../src/repositories/scanner/providers/dependencies-yaml-scanner-provider'
import { SystemFilesAccessImpl } from '../../../../../src/repositories/system-files-access'
import { MockRepositoryAccessFactory } from "../../../../helpers/mock-repository-access-factory"
import { DEPENDENCIES_YAML } from '../../../../helpers/test-data'

import YAML from 'yaml'
import { Refs } from '../../../../../src/domain-model/refs'
import _ from 'lodash'
import { RepositorySource } from '../../../../../src/domain-model/repository-model/repository-source'
import { DependenciesConfig } from '../../../../../src/domain-model/system-config/dependencies-config'
import { Codec } from '../../../../../src/domain-model/system-config/codec'
import { ScannerManager } from '../../../../../src/repositories/scanner/scanner-manager'
import { Scanner } from '../../../../../src/repositories/scanner/scanner'
describe("Test DependenciesYaml provider", () => {

    const repositoryAccessFactory = new MockRepositoryAccessFactory({ [DependenciesConfig.FILE_PATH]: DEPENDENCIES_YAML })
    const fakeSource = new RepositorySource("a", "b")


    const dummySha = Refs.ShaRef.create(_.repeat("0", 40))
    it("Make sure order is kept", async () => {
        const provider = new DependenciesYamlScannerProvider(new SystemFilesAccessImpl(repositoryAccessFactory))
        const result = await provider.scan(fakeSource, dummySha, <DependencyLookup.Provider>{
            getVersion: (ref: DependencyRef.Ref, current: Version): Promise<Version> => {
                if (ref instanceof DependencyRef.ArtifactRef) {
                    if (ref.path === "A/A") {
                        expect(ref.remote).toBe("remote_override")
                        expect(ref.repository).toBe("repo_override")
                        return Promise.resolve(Version.create("2.0.0"))
                    }
                    if (ref.path === "A/B") {
                        expect(ref.remote).toBe("remote")
                        expect(ref.repository).toBe("repo")
                        return Promise.resolve(Version.create("2.1.0"))
                    }
                    if (ref.path === "A/C") {
                        expect(ref.remote).toBe("remote")
                        expect(ref.repository).toBe("repo")
                        return Promise.resolve(Version.create("2.2.0"))
                    }
                }
                return Promise.reject(new Error(`Could not find version for ${ref}`))
            }
        }, LabelCriteria.includeAll())
        expect(result.dependencyUpdates.length).toBe(3)
        result.dependencyUpdates.forEach(update => {
            console.log(update.label, update.path, update.content)
        })

        expect(result.allDependencies.length).toBe(3)
        const updateA = result.dependencyUpdates.find(update => { return update.label === "default" })
        const updateB = result.dependencyUpdates.find(update => { return update.label === "B" })
        const updateC = result.dependencyUpdates.find(update => { return update.label === "C" })
        expect(updateA).toBeDefined()
        expect(updateB).toBeDefined()
        expect(updateC).toBeDefined()

        const convert = (content: string): DependenciesConfig.Config => {
            return Codec.toInstance(YAML.parse(content), DependenciesConfig.Config)
        }
        const yamlA = convert(updateA?.content || "")
        expect(yamlA.artifacts!.items.find(_ => { return _.path === "A/A" })?.revision).toBe("2.0.0")
        expect(yamlA.artifacts!.items.find(_ => { return _.path === "A/B" })?.revision).toBe("1.1.0")
        expect(yamlA.artifacts!.items.find(_ => { return _.path === "A/C" })?.revision).toBe("1.2.0")

        const yamlB = convert(updateB?.content || "")
        expect(yamlB.artifacts!.items.find(_ => { return _.path === "A/A" })?.revision).toBe("1.0.0")
        expect(yamlB.artifacts!.items.find(_ => { return _.path === "A/B" })?.revision).toBe("2.1.0")
        expect(yamlB.artifacts!.items.find(_ => { return _.path === "A/C" })?.revision).toBe("2.2.0")

        const yamlC = convert(updateC?.content || "")
        expect(yamlC.artifacts!.items.find(_ => { return _.path === "A/A" })?.revision).toBe("1.0.0")
        expect(yamlC.artifacts!.items.find(_ => { return _.path === "A/B" })?.revision).toBe("1.1.0")
        expect(yamlC.artifacts!.items.find(_ => { return _.path === "A/C" })?.revision).toBe("2.2.0")
    })

    it("Extract dependencies", async () => {
        const provider = new DependenciesYamlScannerProvider(new SystemFilesAccessImpl(repositoryAccessFactory))
        const dependencies = await provider.getDependencies(fakeSource, dummySha)
        expect(dependencies.length).toBe(3)
        expect(dependencies).toEqual([
            new Scanner.Dependency(
                new DependencyRef.ArtifactRef(
                    "remote_override",
                    "repo_override",
                    "A/A"
                ),
                Version.create("1.0.0")
            ),
            new Scanner.Dependency(
                new DependencyRef.ArtifactRef(
                    "remote",
                    "repo",
                    "A/B"
                ),
                Version.create("1.1.0")
            ),
            new Scanner.Dependency(
                new DependencyRef.ArtifactRef(
                    "remote",
                    "repo",
                    "A/C"
                ),
                Version.create("1.2.0")
            )
        ])
    })
})

