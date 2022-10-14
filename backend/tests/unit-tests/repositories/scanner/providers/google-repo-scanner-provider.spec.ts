import { describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { Refs } from '../../../../../src/domain-model/refs'
import { RepositorySource } from '../../../../../src/domain-model/repository-model/repository-source'
import { DependencyRef } from "../../../../../src/domain-model/system-config/dependency-ref"
import { ServiceConfig } from '../../../../../src/domain-model/system-config/service-config'
import { Version } from "../../../../../src/domain-model/version"
import { DependencyLookup } from '../../../../../src/repositories/scanner/dependency-lookup'
import { LabelCriteria } from "../../../../../src/repositories/scanner/label-criteria"
import { GoogleRepoScannerProvider } from "../../../../../src/repositories/scanner/providers/google-repo-scanner-provider"
import { Scanner } from '../../../../../src/repositories/scanner/scanner'
import { MockRepositoryAccessFactory } from "../../../../helpers/mock-repository-access-factory"
import { DEFAULT_XML } from '../../../../helpers/test-data'

describe("Test DefaultXml provider", () => {

    const repositoryAccess = new MockRepositoryAccessFactory({ "default.xml": DEFAULT_XML })
    const fakeSource = new RepositorySource("a", "b")
    const dummySha = Refs.ShaRef.create(_.repeat("0", 40))
    const sources = [
        new ServiceConfig.GerritSourceService(
            "csp-gerrit",
            "csp-gerrit-ssh.volvocars.biz",
            "csp-gerrit-http.volvocars.biz",
            undefined
        ),
        new ServiceConfig.GitlabSourceService(
            "gitlab",
            "gitlab.volvocars.biz"
        )
    ]

    it("Make sure order is kept", async () => {
        const provider = new GoogleRepoScannerProvider(repositoryAccess, sources)
        const result = await provider.scan(fakeSource, dummySha, <DependencyLookup.Provider>{
            getVersion: (ref: DependencyRef.Ref, current: Version): Promise<Version> => {
                if (ref instanceof DependencyRef.GitRef) {
                    if (ref.source.path === "playground/cynosure/cynosure_a") {
                        expect(ref.source.id).toBe("csp-gerrit")
                        return Promise.resolve(Version.create("1.1.0"))
                    }
                    if (ref.source.path === "playground/cynosure/cynosure_b") {
                        expect(ref.source.id).toBe("csp-gerrit")
                        return Promise.resolve(Version.create("2.1.0"))
                    }
                    if (ref.source.path === "repo/flash-tools") {
                        expect(ref.source.id).toBe("gitlab")
                        return Promise.resolve(Version.create("2.1.0"))
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
        const updateA = result.dependencyUpdates.find(update => { return update.label === "a" })
        const updateB = result.dependencyUpdates.find(update => { return update.label === "b" })
        expect(updateA).toBeDefined()
        expect(updateA!.content.indexOf("v1.1.0")).toBeGreaterThan(0)
        expect(updateA!.content.indexOf("v2.0.0")).toBeGreaterThan(0)
        expect(updateA!.content.indexOf("v2.1.0")).toBe(-1)
        expect(updateB).toBeDefined()
        expect(updateB!.content.indexOf("v2.1.0")).toBeGreaterThan(0)
        expect(updateB!.content.indexOf("v1.0.0")).toBeGreaterThan(0)
        expect(updateB!.content.indexOf("v1.1.0")).toBe(-1)
    })

    it("Extract dependencies", async () => {
        const provider = new GoogleRepoScannerProvider(repositoryAccess, sources)
        const dependencies = await provider.getDependencies(fakeSource, dummySha)
        expect(dependencies.length).toBe(3)
        expect(dependencies).toEqual([
            new Scanner.Dependency(
                new DependencyRef.GitRef(RepositorySource.createFromObject({
                    "id": "csp-gerrit",
                    "path": "playground/cynosure/cynosure_a"
                })),
                Version.create("1.0.0")
            ),
            new Scanner.Dependency(
                new DependencyRef.GitRef(RepositorySource.createFromObject({
                    "id": "csp-gerrit",
                    "path": "playground/cynosure/cynosure_b"
                })),
                Version.create("2.0.0")
            ),
            new Scanner.Dependency(
                new DependencyRef.GitRef(RepositorySource.createFromObject({
                    "id": "gitlab",
                    "path": "repo/flash-tools"
                })),
                Version.create("3.0.0")
            )
        ])
    })
})

