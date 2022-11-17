# Common Build

## Further reading

* [Common build ymls](docs/common-build-yml.md)
* [Integration](docs/integration.md)

# Common Build overview 

Common Build is a general build system that builds software components orchestrated by dependency management. In Common Build developers define produced output (publications) and required input (dependencies) in forms of Source code, General artifacts and Docker images. 

Common Build orchestrates the order of how builds and releases are executed, to update complete product stacks with static dependency references, while still guaranteeing completely static and reproducable builds. 

Common Build is not tied to any specific programming language or software eco-system due to its abstraction of build steps. The abstracted build steps are based on running docker containers where developers point out the logic to be executed by refering to versioned docker images. Builds supports multiple containers, running in parallel, allowing builds to cover more complex cases such as involving the use of third party databases to ensure proper unit testing.

## Repository configuration

Common Build is designed to make a non-intrusive footprint in the developers' repositories. There are some few files required to setup a fully functional Common Build repository.

### The build file: `.common-build/build.yml`

The `build.yml` file defines the docker containers that constitutes the build environment. It declares references to one or more versioned docker images and a set of *commands* that are simple bash-commands to be executed inside the containers.

```yml 
version: 1
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.21.0
build:
  steps:
    - type: compose
      nodes:
        the_compiler:
          image: gcc:12.5
      commands:
        - cmd: make
          node: the_compiler #Optional since only one docker container in build.            
```
> Example of a configuration that runs `make` on the checked out code.

A successful build is a build where all defined commands executed successfully. Often this results in a set of built artifacts residing in the local build folder or a new docker image in the local docker daemon.

### The publication file: `.common-build/publish.yml`

The `publish.yml` is a file that allows developers to declaratively define files from the local build folder to be published into any configurated Artifactory- / Docker registry service. After a successful build Commom Build uses the `publish.yml` file to put the build publications into these remote storages.


```yml
artifacts:
  remote: inhouse-artifactory.company.com
  repository: deliveries
  items:
    - path: software/system_a
      qualifiers:
        - src: build/system.out
          name: system
```
> Example of how to push a built artifact to an inhouse Artifactory service after the build steps have completed.

### The dependencies file: `.common-build/dependencies.yml`

The `dependencies.yml` file defines versioned dependencies in any configured Artifactory service. All `dependencies.yml` files are automatically scanned by Common-Build to identify  updated releases for initializing new builds for automatically upgrading to new dependencies versions when available.

```yml
version: 1
artifacts:
  remote: inhouse-artifactory.company.com
  repository: deliveries
  toDir: external-dependencies
  items:
    - path: software/system_a
      revision: 1.2.3
      files:
        - name: system
```

## Releasing

All builds in Common-Build are done in Gerrit Changes. Incomming Gerrit changes are sequentially queued per `repository/target-branch` combination and rebased before starting. Publications executed in the build of the Change are named by `git-sha` of the commit being built. 

When a change is merged to it's `target-branch` it is by `fast-forward-only` strategy which means that the resulting commit doesn't have to be rebuilt inorder to have its corresponding publications in place.

In Common Build this means that when a release (getting a logical version `M.m.p`) of a commit is triggered it is simply a artifact/docker-image copy `from-git-sha->M.m.p` operation at the remote storages to be complete.

## Dependency automation
New releases result in an optimized broadcast of the new version to repositories having dependencies on it. Common-Build creates new Gerrit changes with updated `dependencies.yml` files pointing to the newly released versions in order to advance the state of dependent components.


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

