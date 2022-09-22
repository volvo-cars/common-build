import { Modal } from "react-bootstrap"
import { ApiRepository } from "../../domain-model/api/repository"
import { RepositoryModel } from "../../domain-model/repository-model/repository-model"
import { CtrlButton } from "../../forms/ctrl-button"
import moment from 'moment'

type Props = {
    commits: ApiRepository.Commit[]
    major: RepositoryModel.TopContainer
    onRelease: (commit: ApiRepository.Commit | undefined) => void
}

export const ReleaseWindow = ({ commits, major, onRelease }: Props) => {
    return (
        <Modal show={true} onHide={() => onRelease(undefined)} size="xl">
            <Modal.Header closeButton>
                <Modal.Title>Release new version from Major {major.major}</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Info</th>
                            <th>Message</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {commits.map(c => {
                            const time = moment.unix(c.timestamp)
                            return (
                                <tr>
                                    <td>
                                        <div className="git-container">
                                            <div className="git-sha">{c.sha}</div>
                                            <div className="git-info-section">
                                                <div className="git-info">{c.committer}</div>
                                                <div className="git-info">{time.fromNow()} ({time.format('YYYY/MM/DD, hh:mm:ss')})</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><div className="git-info">{c.message}</div></td>
                                    <td><CtrlButton.Button variant="primary" size="sm" onClick={() => onRelease(c)}>Release</CtrlButton.Button></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </Modal.Body>
            <Modal.Footer>
                <CtrlButton.Button variant="secondary" onClick={() => onRelease(undefined)}>Cancel</CtrlButton.Button>
            </Modal.Footer>
        </Modal>
    )
}