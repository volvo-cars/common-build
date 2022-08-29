import exp from "constants"
import { ImageVersionUtil } from "../../../src/domain-model/image-version-util"
import { Refs } from "../../../src/domain-model/refs"
import { ServiceConfig } from "../../../src/domain-model/system-config/service-config"
import { Version } from "../../../src/domain-model/version"

describe("Image Version Util", () => {
    it("With host", async () => {
        const raw = "host-a/vcc/my-image:1.0.0"
        const result = ImageVersionUtil.ImageVersion.parse(raw)
        expect(result).toBeDefined()
        expect(result?.repository).toBe("vcc/my-image")
        expect(result?.asString()).toBe("id-a/vcc/my-image:1.0.0")
    })
    it("With storage-id", async () => {
        const raw = "id-b/vcc/my-image:1.0.0"
        const result = ImageVersionUtil.ImageVersion.parse(raw)
        expect(result).toBeDefined()
        expect(result?.repository).toBe("vcc/my-image")
        expect(result?.asString()).toBe("id-b/vcc/my-image:1.0.0")
    })
    it("With newVersion", async () => {
        const raw = "id-b/vcc/my-image:1.0.0"
        const result = ImageVersionUtil.ImageVersion.parse(raw)
        expect(result).toBeDefined()
        const result2 = result?.withVersion(Version.create("2.0.0"))
        expect(result2?.repository).toBe("vcc/my-image")
        expect(result2?.asString()).toBe("id-b/vcc/my-image:2.0.0")
    })
})