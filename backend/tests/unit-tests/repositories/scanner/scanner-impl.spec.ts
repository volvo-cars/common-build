import { describe, expect, it } from '@jest/globals'
import { Version } from "../../../../src/domain-model/version"
import { DependencyLookup } from '../../../../src/repositories/scanner/dependency-lookup'
import { DependencyRef } from "../../../../src/domain-model/system-config/dependency-ref"
import { LabelCriteria } from "../../../../src/repositories/scanner/label-criteria"
import { DependenciesYamlScannerProvider } from '../../../../src/repositories/scanner/providers/dependencies-yaml-scanner-provider'
import { SystemFilesAccessImpl } from '../../../../src/repositories/system-files-access'
import { MockRepositoryAccessFactory } from "../../../helpers/mock-repository-access-factory"
import { DEPENDENCIES_YAML } from '../../../helpers/test-data'

import YAML from 'yaml'
import { Refs } from '../../../../src/domain-model/refs'
import _, { identity } from 'lodash'
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { DependenciesConfig } from '../../../../src/domain-model/system-config/dependencies-config'
import { Codec } from '../../../../src/domain-model/system-config/codec'
import { ScannerManager } from '../../../../src/repositories/scanner/scanner-manager'
import { Scanner } from '../../../../src/repositories/scanner/scanner'
import fs from "fs"
import { TestUtils } from '../../../helpers/test-utils'
import { BuildConfig } from '../../../../src/domain-model/system-config/build-config'
import { BuildYamlScannerProvider } from '../../../../src/repositories/scanner/providers/build-yaml-scanner-provider'
import { ScannerImpl } from '../../../../src/repositories/scanner/scanner-impl'
describe("Test DependenciesYaml provider", () => {

    const dependenciesYml = fs.readFileSync(`${__dirname}/test-data/dependencies.yml`).toString()
    const buildYml = fs.readFileSync(`${__dirname}/test-data/build.yml`).toString()
    const repositoryAccessFactory = new MockRepositoryAccessFactory({ [DependenciesConfig.FILE_PATH]: dependenciesYml, [BuildConfig.FILE_PATH]: buildYml })
    const systemFilesAccess = new SystemFilesAccessImpl(repositoryAccessFactory)
    const fakeSource = new RepositorySource("a", "b")

    it("Test real yml file", async () => {
        const dependenciesYmlProvider = new DependenciesYamlScannerProvider(systemFilesAccess)
        const buildYmlProvider = new BuildYamlScannerProvider(systemFilesAccess)
        const scanner = new ScannerImpl([buildYmlProvider, dependenciesYmlProvider])
        const dependenciesMap = await scanner.getDependencies(fakeSource, TestUtils.sha("0"))
        console.dir(dependenciesMap, { depth: null })

        const dependencies = Array.from(dependenciesMap.keys())
        console.dir(dependencies, { depth: null })

        const expectedDependencies = [
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/sga"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/hi"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/hpa"),
            new DependencyRef.ArtifactRef("ara-artifactory.volvocars.biz", "ARTCSP-CI", "csp/nodes/lpa"),
            new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-tools/rig-runner")

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

