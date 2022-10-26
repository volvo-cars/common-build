import { describe, expect, it } from '@jest/globals'
import { DependencyRef } from "../../../../src/domain-model/system-config/dependency-ref"
import { DependenciesYamlScannerProvider } from '../../../../src/repositories/scanner/providers/dependencies-yaml-scanner-provider'
import { SystemFilesAccessImpl } from '../../../../src/repositories/system-files-access-impl'
import { MockRepositoryAccessFactory } from "../../../helpers/mock-repository-access-factory"

import fs from "fs"
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { BuildConfig } from '../../../../src/domain-model/system-config/build-config'
import { DependenciesConfig } from '../../../../src/domain-model/system-config/dependencies-config'
import { ServiceConfig } from '../../../../src/domain-model/system-config/service-config'
import { BuildYamlScannerProvider } from '../../../../src/repositories/scanner/providers/build-yaml-scanner-provider'
import { GoogleRepoScannerProvider } from '../../../../src/repositories/scanner/providers/google-repo-scanner-provider'
import { ScannerImpl } from '../../../../src/repositories/scanner/scanner-impl'
import { TestUtils } from '../../../helpers/test-utils'
describe("Test DependenciesYaml provider", () => {



    it("Test real yml file", async () => {

        const dependenciesYml = fs.readFileSync(`${__dirname}/test-data/dependencies.yml`).toString()
        const buildYml = fs.readFileSync(`${__dirname}/test-data/build.yml`).toString()
        const defaultXml = fs.readFileSync(`${__dirname}/test-data/default.xml`).toString()
        const repositoryAccessFactory = new MockRepositoryAccessFactory({ [DependenciesConfig.FILE_PATH]: dependenciesYml, [BuildConfig.FILE_PATH]: buildYml, "default.xml": defaultXml })
        const systemFilesAccess = new SystemFilesAccessImpl(repositoryAccessFactory)
        const fakeSource = new RepositorySource("a", "b")
        const sourceServices: ServiceConfig.SourceService[] = [
            new ServiceConfig.GerritSourceService("csp-gerrit", "csp-gerrit-ssh.volvocars.net", "csp-gerrit.volvocars.biz", undefined)
        ]

        const dependenciesYmlProvider = new DependenciesYamlScannerProvider(systemFilesAccess)
        const buildYmlProvider = new BuildYamlScannerProvider(systemFilesAccess)
        const googleProvider = new GoogleRepoScannerProvider(repositoryAccessFactory, sourceServices)

        const scanner = new ScannerImpl([buildYmlProvider, dependenciesYmlProvider, googleProvider])
        const dependenciesMap = await scanner.getDependencies(fakeSource, TestUtils.sha("0"))
        const dependencies = Array.from(dependenciesMap.keys())
        console.dir(dependencies, { depth: null })

        const expectedDependencies = [
            new DependencyRef.GitRef(new RepositorySource("csp-gerrit", "csp/test")),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/sga"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/hi"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/hpa"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/lpa"),
            new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-tools/rig-runner"),
            new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-tools/idrom")
        ]

        expectedDependencies.forEach(ed => {
            const edSerialized = ed.serialize()
            const found = dependencies.find(d => {
                return edSerialized === d.serialize()
            })
            if (!found) {
                console.error("Could not find " + ed.toString())
            }
            expect(found).toBeDefined()
        })
    })


})

