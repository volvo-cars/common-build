import { PromotedVersion, PromotionId } from "../../domain-model/promoted-version"
import { Version } from "../../domain-model/version"
import _ from 'lodash'
import { NumberTypedMap } from "../../utils/model"

/**
 * Promotion container builds a version tree of the given Promoted versions enabling "version aware" update queries.
 */
export class PromotedVersionsContainer {

    private container: Container = new Container()

    private constructor(container: Container) {
        this.container = container
    }

    static create(promotedVersions: PromotedVersion[]): PromotedVersionsContainer {
        let container = new Container()
        _.each(promotedVersions, (promotedVersion: PromotedVersion) => {
            container.add(promotedVersion, promotedVersion.version.segments)
        })
        return new PromotedVersionsContainer(container)
    }

    findUpgrade(version: Version, qualifyingPromotions: PromotionId[] = []): PromotedVersion | null {
        throw "NI"
    }

    findHighest(qualifyingPromotions: PromotionId[]): PromotedVersion | null {

        throw "NI"
    }
}

class Container {
    private containers: NumberTypedMap<Container> = {}
    private version: PromotedVersion | null = null
    constructor() { }

    findHighest(qualifyingPromotions: PromotionId[]): PromotedVersion | null {
        let segments = Object.keys(this.containers)
        if (segments.length === 0) {
            if (this.version) {
                return qualifyingPromotions.length === 0 ? this.version : (_.intersection(qualifyingPromotions, this.version.promotions).length > 0 ? this.version : null)
            } else {
                return null
            }
        } else {
            throw "NI"
        }
    }

    add(version: PromotedVersion, remainingSegments: number[]): void {
        let segment = _.first(remainingSegments)
        if (segment === undefined) {
            this.version = version
        } else {
            let container = this.containers[segment]
            if (!container) {
                container = new Container()
                this.containers[segment] = container
            }
            container.add(version, _.tail(remainingSegments))
        }
    }
}

