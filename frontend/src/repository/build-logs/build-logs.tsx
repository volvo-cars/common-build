import { AxiosError, AxiosResponse } from "axios"
import _ from "lodash"
import { useEffect, useState } from "react"
import { Col, Row, Table } from "react-bootstrap"
import { useParams } from "react-router-dom"
import { ApiRepository } from "../../domain-model/api/repository"
import { BuildLogEvents } from "../../domain-model/buildlog-events/buildlog-events"
import { RepositorySource } from "../../domain-model/repository-model/repository-source"
import { Codec } from "../../domain-model/system-config/codec"
import { CtrlDuration } from "../../forms/ctrl-duration"
import { CtrlMarkdown } from "../../forms/ctrl-markdown"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
import { BuildEntryLevel } from "./build-entry-level"

export type Props = {
    source: RepositorySource
}

export const BuildLogs = ({ source }: Props) => {
    const params = useParams<{ id: string }>()
    const logId = params.id
    const notification = useNotifications()
    const [log, setLog] = useState<BuildLogEvents.BuildLog | undefined>(undefined)
    const loadLogs = (loadLogId: string) => {
        Http.createRequest("/api/repository/buildlog-events", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.BuildLogRequest(source, loadLogId))).execute().then((response: AxiosResponse<any>) => {
            setLog(Codec.toInstance(response.data, ApiRepository.BuildLogResponse).log)
        }).catch((e: AxiosError) => {
            notification.error(`${e}`)
        })
    }

    if (logId) {
        useEffect(() => {
            loadLogs(logId)
            const timer = setInterval(() => { loadLogs(logId) }, 10000)
            return () => {
                clearTimeout(timer)
            }
        }, [logId])
        if (log) {
            if (log.entries.length) {
                const start = log.entries[log.entries.length - 1].timestamp
                return (
                    <>
                        <Table striped={true}>
                            <tbody>
                                {log.entries.map(entry => {
                                    return (
                                        <>
                                            <tr>
                                                <td><BuildEntryLevel level={entry.level} /></td>
                                                <td><CtrlMarkdown markdown={entry.message} /></td>
                                                <td align="right"><CtrlDuration millseconds={entry.timestamp.getTime() - start.getTime()} /></td>
                                            </tr>
                                        </>
                                    )
                                })}
                            </tbody>
                        </Table>
                    </>
                )
            } else {
                return (
                    <Row>
                        <Col>No log entries found...</Col>
                    </Row>
                )
            }
        } else {
            return (<Row>
                <Col>Loading logs...</Col>
            </Row>)
        }
    } else {
        notification.error("Missing `/id` in url.")
        return (null)
    }

}