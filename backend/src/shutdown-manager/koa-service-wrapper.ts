import { ShutdownManager } from "./shutdown-manager";
import { Server } from 'http'

export class KoaServiceWrapper implements ShutdownManager.Service {
    public serviceName = `Http server`
    public shutdownPriority = 1;
    constructor(private server: Server) { }
    shutdown(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((err?: Error) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        })
    }

}