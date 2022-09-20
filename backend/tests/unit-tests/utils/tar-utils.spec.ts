import 'jest'
import { ensureDefined, ensureString, ensureTrue } from '../../../src/utils/ensures'
import { TarUtils } from '../../../src/utils/tar-utils'
import fs from 'fs'
describe("Tar utils", () => {
    it("Extract files", async () => {
        const countByType: Record<string, number> = {}
        const fileHandler = <TarUtils.Handler>{
            accept(meta, content) {
                countByType[meta.type] = (countByType[meta.type] || 0) + 1
                content.resume()
            }
        }
        const file = `${__dirname}/data/test.tar.gz`
        await TarUtils.extractFiles(fs.createReadStream(file), fileHandler)
        console.log("Counts", countByType)
        expect(countByType).toEqual({ file: 2, directory: 2 })
    })

})

