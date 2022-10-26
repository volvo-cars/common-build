import { DockerUtils } from "../../../../../src/repositories/scanner/providers/docker-utils"

describe("RevisionUtil", () => {


    it("Find", async () => {
        const dockerFile = ` 
FROM ubuntu:20.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update 
        `
        const rawImage = DockerUtils.findFrom(dockerFile)
        expect(rawImage).toBe("ubuntu:20.04")
    })
})

