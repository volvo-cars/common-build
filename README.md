# One-build

# Documentation

[Integration](docs/integration.md)

# Development setup

1. ***Create development docker image*** Run script `/docker/dev/build.sh` to create the development docker image and push it to local registry.
2. ***Add Vault credentials*** Edit your local `.bashrc` (or equivilent) to export your personal vault token. `export VAULT_TOKEN=<YOUR_PERSONAL_TOKEN>`. The env variable will be forwarded to the dev container. Retrieve your token att [Winterfell vault](https://winterfell.csp-dev.net/)

Run script `/docker/dev/run.sh` to start docker containers for `frontend|backend`. The containers will be named with these logical names.

### Backend 

To enter the backend type: `docker/dev/enter.sh backend`. Once inside the container start the backend service by typing `./start-dev <DEV-PROFILE>`

The dev profile maps to dev-<DEV-PROFILE>.yaml and allows only defined repositories to be processed.

`npm run test`        #Runs unit-tests

### Frontend

To enter the backend type: `docker/dev/enter.sh frontend`. Once inside the container start the frontend service by typing `npm run start`.


To install the correct dependencies always run `npm install` from inside each respective environment before starting up any service.

### Access

* Frontend: `localhost:4000`
* Backend: `localhost:3000`

## VM Configuration
Plain Ubuntu 20.04 VM with Docker installed. (Docker compose must use atleast 1.29.2)

* [https://docs.docker.com/engine/install/ubuntu/](https://docs.docker.com/engine/install/ubuntu/)

