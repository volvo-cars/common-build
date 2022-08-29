
import _ from 'lodash'

export namespace LabelCriteria {

    export const DEFAULT_LABEL_NAME = "default"

    export interface Criteria {
        include(labels: string[]): string[]
    }

    export const exclude = (excludes: string[]): Criteria => {
        return {
            include: (labels: string[]): string[] => {
                return _.uniq(_.difference(labels, excludes))
            }
        }
    }
    export const include = (includes: string[]): Criteria => {
        return {
            include: (labels: string[]): string[] => {
                return _.uniq(_.intersection(includes, labels))
            }
        }
    }
    export const includeAll = (): Criteria => {
        return {
            include: (labels: string[]): string[] => {
                return _.uniq(labels)
            }
        }
    }
}