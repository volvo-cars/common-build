import { AxiosResponse } from "axios"
import _ from "lodash"
import { FormEvent, useEffect, useState } from "react"
import { Button, Col, Form, Row } from "react-bootstrap"
import { NavLink, useNavigate, useParams } from "react-router-dom"
import { ApiRepository } from "../../domain-model/api/repository"
import { Codec } from "../../domain-model/system-config/codec"
import { Majors } from "../../domain-model/system-config/majors"
import { useNotifications } from "../../notifications/notifications"
import { Http, HttpMethod } from "../../utils/http"
type BackendResponse = {
    message: string
}


export const MajorsView = () => {
    const { major } = useParams()
    const [series, setSeries] = useState<Majors.Serie[] | undefined>()
    const [updatedValue, setUpdatedValue] = useState<number | undefined>()
    const navigate = useNavigate()
    const notifications = useNotifications()

    useEffect(() => {
        Http.createRequest("/api/admin/majors/values").execute().then((response: AxiosResponse<ApiRepository.MajorSeriesResponse>) => {
            const series = Codec.toInstance(response.data, ApiRepository.MajorSeriesResponse).series
            setSeries(series)
            if (series.length === 1) {
                navigate(`/admin/majors/${series[0].id}`)
            }
        }).catch(e => {
            notifications.error(`${e}`)
        })

    }, [])
    const selectedSerie = (series || []).find(serie => { return serie.id === major })
    if (selectedSerie && updatedValue === undefined) {
        setUpdatedValue((_.max(selectedSerie.values) || 0) + 1)
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (selectedSerie && updatedValue) {
            notifications.info(`Updating major serie ${selectedSerie.id}...`, 100)
            Http.createRequest("/api/admin/majors/values/add", HttpMethod.POST).setData(Codec.toPlain(new ApiRepository.MajorSerieAddValueRequest(new Majors.Value(selectedSerie.id, updatedValue)))).execute().then((response: AxiosResponse<ApiRepository.MajorSerieAddValueResponse>) => {

                const parsedResponse = Codec.toInstance(response.data, ApiRepository.MajorSerieAddValueResponse)
                notifications.info(parsedResponse.message)
                const updatedSerie = parsedResponse.serie
                const newSeries = series?.map(s => {
                    return s.id === updatedSerie.id ? updatedSerie : s
                })
                setSeries(newSeries)
                setUpdatedValue(undefined)
            }).catch((e) => {
                if (e.response?.status === 400) {
                    notifications.error(e.response?.data?.message || "Unknown error")
                }
            }).catch(e => {
                notifications.error(`${e}`)
            })
        }
    }


    return (
        <Row>
            <Col xs={3}>
                <h4>Major series</h4>
                <div>Available series</div>
                {!series &&
                    <div>Loading...</div>
                }
                {series?.length === 0 &&
                    <div>None available</div>
                }
                {series &&
                    <>
                        {series.map(serie => {
                            return (<NavLink key={serie.id} to={`/admin/majors/${serie.id}`} className={({ isActive }) =>
                                isActive ? "active_major" : undefined
                            }>
                                {serie.id}
                            </NavLink>)
                        })}
                    </>
                }

            </Col>
            <Col xs={9}>
                {selectedSerie &&
                    <>
                        <h5>{selectedSerie.id}</h5>
                        Defined majors: {selectedSerie.values.join(", ")}

                        <Form onSubmit={onSubmit}>
                            <Row>
                                <Form.Label column lg={3}>New major</Form.Label>
                                <Col>
                                    <Form.Control type="number" style={{ width: 100 }} value={updatedValue || ""} onChange={(e) => {
                                        setUpdatedValue(parseInt(e.target.value) || undefined)
                                    }} />

                                </Col>
                                <Col>
                                    <Button variant="primary" type="submit" disabled={!((updatedValue || 0) > 0)} >
                                        Create
                                    </Button>
                                </Col>
                            </Row>
                        </Form>
                    </>
                }
                {!selectedSerie &&
                    <div>Select Major serie</div>
                }
            </Col>
        </Row>
    )
}