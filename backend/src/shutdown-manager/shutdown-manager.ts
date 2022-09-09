export namespace ShutdownManager {

    export interface Service {
        serviceName: string
        shutdownPriority: number  // Lower value earlier in the shut down sequence
        shutdown(): Promise<void>
    }

    export interface Manager {
        register(service: Service): void
        shutdownAll(): Promise<void>
    }

}
