import gunzip from "gunzip-maybe";
import { Readable } from "stream";
import tar from "tar-stream";
export namespace TarUtils {

    export type Meta = {
        name: string
        type: "file" | "directory"
        size: number
    }

    export interface Handler {
        accept(meta: Meta, content: Readable): void
    }

    export const extractFiles = (tarStream: Readable, callback: Handler): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            const extractor = tar.extract()
            extractor.on('entry', (headers, entryStream, next) => {
                callback.accept(<Meta>headers, entryStream)
                entryStream.on('end', () => {
                    next()
                })
                entryStream.resume()
            })
            extractor.on("finish", () => {
                resolve()
            })
            extractor.on("error", (e) => {
                reject(e)
            })
            tarStream.pipe(gunzip()).pipe(extractor)
        })

    }

}