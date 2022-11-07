# Common Build Yml files

# The build.yml file.

The `.common-build/build.yml` file controls how a build is executed. The build is made up of a sequence of two different build step types:

* Build step `compose`: Sets up a number of a docker containers and invokes commands on them to produce output.
* Build step `build`: Builds a new docker image.

Note: At build time all containers have the checkout out source code as their working directory. 

## Executing the build
```
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        ubuntu1:
          image: gcc:9.5
      commands:
        - cmd: make
```
Minimal `build.yml` to compile some c files.


## Creating docker-images

```yml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: build
      name: my-org/my-docker-image
      file: docker/Dockerfile
```
When building docker images you need to have a corresponding docker file.

Ex: `docker/Dockerfile`:

```docker
FROM ubuntu:20.04
COPY build /app
```

# Publishing artifacts and images
Publishing in Common Build is declarative. This means that a biuld only declares what files and images that should be published after a successful build.

The file controlling publication is `.common-build/publish.yml`.

## Publishing artifacts

```yml
artifacts:
  remote: ara-artifactory.volvocars.biz
  repository: ARTCSP-CI
  items:
    - path: playground/my-test
      qualifiers:
        - src: README.md
        - src: some-folder/*.txt 
          name: my-text-files.tar.gz
```
Common Build will only publish files to the root level of the artifact in artifactory. This means that whenever multiple files are matched they are automatically packed into a `.tar.gz`. 

The filename will default to the matched filename if a single pattern is used. Otherwise it will default to `last-folder-segment.tar.gz` of the glob-pattern.

The optional attribe `qualifier.name` can be used to rename the file to whatever you feel is suitable.

## Publishing artifacts with properties
Common Build supports adding properties to published artifacts. Properties are stored as native Artifactory properties on *folder-level*.

```yml
artifacts:
  remote: ara-artifactory.volvocars.biz
  repository: ARTCSP-CI
  items:
    - path: playground/my-test
      properties: 
         myProperty1: value1
         property2: value2
      qualifiers:
        - src: README.md
        - src: some-folder/*.txt 
          name: my-text-files.tar.gz
```


## Publishing docker-images

```yml
images: 
  remote: artcsp-docker.ara-artifactory.volvocars.biz
  items:
    - name: my-org/my-docker-image

```
Built images only exist in the local daemon until they are published. Publish your built docker image by adding it to the `images` section of the `publish.yml` file. 


# Using secrets

Secrets are supported in both `compose` and `build` steps.

Secrets are mounted in standard docker location `/run/secrets/secret-name`



## Using secrets in `compose` build step.

```yml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        ubuntu1:
          image: ubuntu:18.04
      secrets:
        secretA: csp/playground/my-secret
      commands:
        - cmd: | 
            export SECRET=$(cat /run/secrets/secretA)
            echo The secret value $SECRET
```

## Using secrets in `build` build step.

```yml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: build
      secrets: 
        mySecret: csp/playground/my-secret
      name: my-org/my-docker-image
      file: docker/Dockerfile
```
When using secrets in docker build there is an extra step needed for `RUN` statements in the `Dockerfile` in order to mount the secrets correctly.


Ex: `docker/Dockerfile`:

```docker
FROM ubuntu:20.04
COPY build /app
RUN --mount=type=secret,id=mySecret echo /run/secrets/mySecret
```

# Using labels

Labels can be used to group dependency updates into different Updates (Gerrit Changes). All dependencies for a given `label` will be updated in change with the hashtag with the value of the label. Labels can be attached different `merge/release/nothing` behavior in your Repositories config via the CB-ui.

**Note:** The default label for all docker image references in `build.yml` is `building-tools` with the default action of `merge`.

Multiple labels can be defined for a dependency. When giving multiple labels the dependency update with appear in multiple changes with the corresponding label names.

## Using labels in `compose` build step.

Ex: 
```yml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        ubuntu1:
          image: vcc/volvo-image:10.0.0
          labels: internal-volvo
      commands:
        - cmd: | 
            export SECRET=$(cat /run/secrets/secretA)
            echo The secret value $SECRET
```
Will put the `vcc/volvo-image` update in its own Change tagged `internal-volvo`. 

## Using labels in `build` build step.

```yml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.17.0
version: 1
build:
  steps:
    - type: build
      name: my-org/my-docker-image
      file: docker/Dockerfile
      labels: internal-volvo
```
Dependency update is based on the `FROM <image>` in the docker file.