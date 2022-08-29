import 'jest'
import _ from 'lodash'
import { Test_ArtifactoryArtifact, Test_convertArticat } from '../../../../src/artifact-storage/artifactory/artifactory'

describe("Artifactory artifacts to internal Artifact conversion", () => {
    it("convert artifact with properties", async () => {
        let artifactoryArtifact = {
            "repo": "ARTCSP",
            "path": "HI_release/CSP",
            "name": "2137.1.0",
            "type": "folder",
            "size": 0,
            "created": "2021-10-08T15:53:32.556+02:00",
            "created_by": "fszymans",
            "modified": "2021-10-08T15:53:32.556+02:00",
            "modified_by": "fszymans",
            "updated": "2021-10-08T15:53:32.556+02:00",
            "depth": 3,
            "properties": [
                {
                    "key": "test-property",
                    "value": "test-value"
                }
            ],
            "repo_path_checksum": "c7785599ebbe603f343ffb6f16b78fb58e154c80",
            "virtual_repos": []
        } as Test_ArtifactoryArtifact
        let convertedArtifact = Test_convertArticat(artifactoryArtifact)

        expect(convertedArtifact).toBeDefined()
        expect(convertedArtifact.version).toBe("2137.1.0")
        expect(convertedArtifact.properties).toBeDefined()
        expect(_.size(convertedArtifact.properties)).toBe(1)
        expect(convertedArtifact.properties["test-property"]).toBe("test-value")

    })
    it("convert artifact without properties", async () => {
        let artifactoryArtifact = {
            "repo": "ARTCSP",
            "path": "HI_release/CSP",
            "name": "2137.1.0",
            "type": "folder",
            "size": 0,
            "created": "2021-10-08T15:53:32.556+02:00",
            "created_by": "fszymans",
            "modified": "2021-10-08T15:53:32.556+02:00",
            "modified_by": "fszymans",
            "updated": "2021-10-08T15:53:32.556+02:00",
            "depth": 3,
            "repo_path_checksum": "c7785599ebbe603f343ffb6f16b78fb58e154c80",
            "virtual_repos": []
        } as Test_ArtifactoryArtifact
        let convertedArtifact = Test_convertArticat(artifactoryArtifact)

        expect(convertedArtifact).toBeDefined()
        expect(convertedArtifact.version).toBe("2137.1.0")
        expect(convertedArtifact.properties).toBeDefined()
        expect(_.size(convertedArtifact.properties)).toBe(0)

    })
})