
import { Col, Container, Row } from 'react-bootstrap';
import { Route, Routes } from 'react-router-dom';
import { MajorsView } from './admin/majors/majors-view';
import { NavBar } from './nav-bar';
import { RepositoryViewContainer } from './repository/repository-view-container';
import { Welcome } from './welcome';

export const App = () => {
  return (
    <Container>
      <Row>
        <Col xs={12}>
          <NavBar />
        </Col>
      </Row>
      <Row>
        <Col>
          <Routes>
            <Route path="/repo/:serialized/*" element={<RepositoryViewContainer />} />
            <Route path="/admin/majors" element={<MajorsView />} />
            <Route path="/admin/majors/:major" element={<MajorsView />} />
            <Route path="*" element={<Welcome />} />
          </Routes>
        </Col>
      </Row>
    </Container>
  );
}
