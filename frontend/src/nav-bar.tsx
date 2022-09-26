import { Container, Nav, Navbar, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { RepositorySearch } from './repository-search/repository-search';
import { RepositorySourceUtil } from './utils/repository-source-util';
export const NavBar = () => {
    let navigate = useNavigate();
    return (
        <Navbar className="override-navbar" expand="lg">
            <Container>
                <Navbar.Brand href="/"><div className='logo'>
                    <span className="first">Common</span><span className="second">Build</span>
                </div></Navbar.Brand>
                <Navbar.Toggle aria-controls="navbarScroll" />
                <Navbar.Collapse id="navbarScroll">
                    <Nav
                        className="me-auto"
                        style={{ maxHeight: '100px' }}
                        navbarScroll
                    >
                        <NavDropdown title="Admin" id="navbarScrollingDropdown">
                            <NavDropdown.Item as={Link} to="/admin/majors">Major series</NavDropdown.Item>
                        </NavDropdown>
                    </Nav>
                    <Nav>
                        <RepositorySearch onSelect={(source) => {
                            if (source) {
                                navigate(`repo/${RepositorySourceUtil.serialize(source)}/state`)
                            }
                        }} />
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    )
}