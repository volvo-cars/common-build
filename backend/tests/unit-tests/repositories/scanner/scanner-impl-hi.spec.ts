import { describe, it } from '@jest/globals'
import { DependencyRef } from "../../../../src/domain-model/system-config/dependency-ref"
import { SystemFilesAccessImpl } from '../../../../src/repositories/system-files-access-impl'
import { MockRepositoryAccessFactory } from "../../../helpers/mock-repository-access-factory"

import fs from "fs"
import { RepositorySource } from '../../../../src/domain-model/repository-model/repository-source'
import { BuildConfig } from '../../../../src/domain-model/system-config/build-config'
import { Version } from '../../../../src/domain-model/version'
import { LabelCriteria } from '../../../../src/repositories/scanner/label-criteria'
import { BuildYamlScannerProvider, cbToolLabel } from '../../../../src/repositories/scanner/providers/build-yaml-scanner-provider'
import { ScannerImpl } from '../../../../src/repositories/scanner/scanner-impl'
import { MockDependencyProvider } from '../../../helpers/mock-dependency-provider'
import { TestUtils } from '../../../helpers/test-utils'
describe("Test DependenciesYaml provider", () => {



    it("Create update for build.yml", async () => {

        const fakeSource = new RepositorySource("a", "b")
        const fakeSha = TestUtils.sha("0")

        const buildYml = fs.readFileSync(`${__dirname}/test-data/build-hi.yml`).toString()
        const repositoryAccessFactory = new MockRepositoryAccessFactory({ [BuildConfig.FILE_PATH]: buildYml })
        const systemFilesAccess = new SystemFilesAccessImpl(repositoryAccessFactory)

        const buildYmlProvider = new BuildYamlScannerProvider(systemFilesAccess)

        const scanner = new ScannerImpl([buildYmlProvider])
        const dependencyProvider = new MockDependencyProvider()
        const downloadManifestsRef = new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-tools/download-manifest-files")
        const toolImageRef = new DependencyRef.ImageRef("artcsp-docker.ara-artifactory.volvocars.biz", "vcc/common-build-agent")
        dependencyProvider.addLookup(downloadManifestsRef, Version.create("0.3.0"))
        dependencyProvider.addLookup(toolImageRef, Version.create("0.18.0"))

        const updates = await scanner.scan(fakeSource, fakeSha, dependencyProvider, LabelCriteria.includeAll())
        console.dir(updates)

        expect(updates.dependencyUpdates.length).toBe(2)
        const cbUpdate = updates.dependencyUpdates.find(d => { return d.label === cbToolLabel })
        if (cbUpdate) {
            expect(cbUpdate.content.includes("toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.18.0")).toBe(true)
        } else {
            fail(`${cbToolLabel} update should have been found.`)
        }
        const defaultUpdate = updates.dependencyUpdates.find(d => { return d.label === "default" })
        if (defaultUpdate) {
            expect(defaultUpdate.content.includes("image: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-tools/download-manifest-files:0.3.0")).toBe(true)
        } else {
            fail(`default update should have been found.`)
        }

    })


})

