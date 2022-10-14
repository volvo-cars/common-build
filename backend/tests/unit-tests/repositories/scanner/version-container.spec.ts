import { describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { Version } from '../../../../src/domain-model/version'
import { VersionContainer } from '../../../../src/repositories/scanner/version-container'

describe("Version Container", () => {

  it("Empty", async () => {
    const c = VersionContainer.fromVersions([])
    expect(c.getHighest(undefined)).toBeUndefined()
    expect(c.getHighest(1)).toBeUndefined()
  })
  it("One version", async () => {
    const c = VersionContainer.fromVersions([Version.fromSegments([1, 0, 0])])
    expect(c.getHighest(undefined)?.asString()).toBe("1.0.0")
    expect(c.getHighest(1)?.asString()).toBe("1.0.0")
    expect(c.getHighest(2)?.asString()).toBe("1.0.0")
    expect(c.getHighest(0)?.asString()).toBeUndefined()
  })
  it("Two version", async () => {
    const c = VersionContainer.fromVersions([
      Version.fromSegments([1, 0, 0]),
      Version.fromSegments([1, 1, 0]),
      Version.fromSegments([2, 0, 0]),
      Version.fromSegments([2, 1, 0])
    ])
    expect(c.getHighest(undefined)?.asString()).toBe("2.1.0")
    expect(c.getHighest(1)?.asString()).toBe("1.1.0")
    expect(c.getHighest(2)?.asString()).toBe("2.1.0")
    expect(c.getHighest(3)?.asString()).toBe("2.1.0")
  })
  it("Versions higher than 100", async () => {
    const versions = _.range(1, 1000).flatMap(i => {
      return _.range(1, 10).map(i2 => {
        return Version.fromSegments([100, i, i2 * 1000])
      })
    })

    const c = VersionContainer.fromVersions(versions)
    expect(c.getHighest(undefined)?.asString()).toBe("100.999.9000")
  })

  it("Serialize deserialize", async () => {
    const c = VersionContainer.fromVersions([
      Version.fromSegments([1, 0, 0]),
      Version.fromSegments([1, 1, 0]),
      Version.fromSegments([2, 0, 0]),
      Version.fromSegments([2, 1, 0])
    ])
    const serialized = c.serialize()
    expect(typeof serialized).toBe("string")
    const c2 = VersionContainer.deserialize(serialized)

    console.dir(c2, { depth: null })
    console.log(serialized)
    expect(c.size()).toBe(4)
    expect(c2.getHighest(1)?.asString()).toBe("1.1.0")
    expect(c2.size()).toBe(4)
  })

  /*  
    it("Real serialization issue", async () => {
      const serialized = `
          
          `
      const container = VersionContainer.deserialize(serialized)
      //console.dir(container, { depth: null })
      expect(container.getHighest(undefined)?.asString()).toBe("35.117.0")
    })
  
    */

})

