export enum ProductType {
    SOURCE = "source",
    BINARY = "binary"
}

export type ProductNamespace = string
export type ProductInstance = string

export interface ProductRef {
    namespace: ProductNamespace
    instance: ProductInstance
}

interface Product {
    type: ProductType
}

export interface SourceProduct extends Product {

}

export interface BinaryProduct extends Product {

}

export interface Cynosure {
    findProduct(product: ProductRef): Promise<Product | null>
}


