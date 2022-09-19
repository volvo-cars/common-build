# Common-Build Workshop

The Common-Build workshop is a training where we will configure a simple build for a single repository and then extend the model by using more advanced features of Common-Build.

## Lesson 0 - preparations
This workshop contains practical exercises. In order to follow these exercises the following preparation work has to be completed.

1. Create a new repository on [csp-gerrit.volvocars.biz](https://csp-gerrit.volvocars.biz) with name `playground/workshop_<CDSID>_1`. Clone it with standard hooks to your local environment.

2. Navigate to [victoria.volvocars.biz](https://victoria.volvocars.biz) and search for your *Source product* `playground/workshop_<CDSID>_1` in the search field. Press the small cogwheel, in the bottom left pane, to configure your repository in Cynosure. Complete the following to configurations:
    
    *  *Access section* must be filled out with your [Gerrit public key](https://csp-gerrit.volvocars.biz/settings/#SSHKeys)
    * Activate the option *Use SHA1 as ProductId.instance*.

## Lesson 1 - build.yml
For a Git repository to become a Common-Build configured repository it must contain the file `.common-build/build.yml`. 

> Task: Create the file `.common-build/build.yml` and push it to `HEAD:refs/for/master`

```yaml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.12.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        image1:
          image: ubuntu:20.04
      commands:
        - cmd: echo Hello world!
        - cmd: |
            source /etc/os-release                #Defines the VERSION env var with OS version.
            echo Hello world from Ubuntu $VERSION.
```
A `build.yml` file containing one image and two commands executing on it. For more complex scenarios you may add more images (like persistence) that would run in parallel. 

> Task: Navigate to your project page on Cynosure to see your build. Browse the logs and you should see the print out from the execution of commands and the final verdict of your build should be **passed**.

## Lesson 2 - publish.yml
Common-build has declarative publication of artifacts. I.e. we declare what files should be picked up after a successful build and published to artifactory.

> Task: Add the following files in the given structure to your repository

```
/out
    directory
        fileA.txt
        fileB.txt
    singlefile.txt
```
> Task: Add the following file `.common-build/publish.yml` to your repository.

```yaml
artifacts:
  remote: ara-artifactory.volvocars.biz
  repository: ARTCSP-CI
  items:
    - path: common-build/playground/workshop_<CDSID>_1
      qualifiers:
        - src: out/directory
        - src: out/singlefile.txt
```

> Task: Commit and push the commit to `HEAD:refs/for/master`. 
The build should now publish the declared artifact with the following files in Artifactory:

* `directory.tar.gz` (Common-Build automatically packs the directory into a `.tar.gz` with the last segment as name).
* `singlefile.txt` (Common-Build will publish single files as is)

> Task: Add a copy of the qualifiers to show renaming function.

```yaml
artifacts:
  remote: ara-artifactory.volvocars.biz
  repository: ARTCSP-CI
  items:
    - path: common-build-workshop/playground/workshop_<CDSID>_1
      qualifiers:
        - src: out/directory
        - src: out/singlefile.txt
        - src: out/directory 
          name: files       # Will rename the file to files.tar.gz
        - src: out/singlefile.txt
          name: singlefile_newname.txt # singlefile_newname.txt
```

## Lesson 3 - release
In Common-Build we release a commit whenever developers feel that they are happy with it. 

> Task: Navigate to [common-build-staging.csp-dev.net](https://common-build-staging.csp-dev.net). Select your project in the drop-down list. Go to the *state* section and hit release.

Common-Build will then release the latest commit on *master*.

> Task: Do a `git pull --tags` in your local environment. You should see that the tag `v0.0.0` is attached to the latest commit on master when doing a `git log`.

A release in Common-Build always results in a corresponding, automatically incremented, tag `vM.m.0` in git.

> Task: Navigate to [ara-artifactory.volvocars.biz](https://ara-artifactory.volvocars.biz). Open up the folder `ARTCSP-CI/common-build-workshop/playground/workshop_<CDSID>_1` and you will see that the files in the artifact named by the git-sha (HEAD of master) have been copied to a new folder `0.1.0`. 

**Note**: When we a do a release in Common-Build we don't rebuild artifacts - instead we copy them to a logical name defined by the version.

## Lesson 4 - Configure automatic releases.
You may define automatic rules to be applied to Changes after a successful build.
The possible values are:

* Merge - the Change will be merged with its target branch.
* Release - the Change will be merged with its target branch and then released.
* Nothing - the Change will remain unmerged.

> Task: Naviate to [common-build-staging.csp-dev.net](https://common-build-staging.csp-dev.net) and select your `playground/workshop_<CDSID>_1` in the drop down menu.
Navigate to the *Configuration* section and change the *Default action* to *Release*.

> Task: Make a dummy commit in `playground/workshop_<CDSID>_1`. Verify that the build starts and that a merge and release is performed after a successful build by executing `git pull --tags` in your terminal.

## Lesson 5 - dependencies.yml and default.xml
Dependencies to other components are defined in some kind of manifest files. Common-Build supports two types of manifests:

* default.xml (standard Google repo tool format). 
* dependencies.yml (Common-Build format for artifacts)

> Task: Create a second repository `playground/workshop_<CDSID>_2` by repeating the steps in *Lesson 0*. 

> Task: Create the following `.common-build/build.yml` file in order to see the downloaded dependencies at build time.

```yaml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.12.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        image1:
          image: ubuntu:20.04
      commands:
        - cmd: echo Hello world!
        - cmd: find . | grep -v '\.git' #Prints all files recursily except .git
```
### dependencies.yml - downloading binary dependencies from Artifactory.

> Task: Create file: `.common-build/dependencies.yml` to consume artifacts from your other project `playground/workshop_<CDSID>_1`.

```yaml
version: 1
artifacts:
  toDir: external-dependencies
  remote: ara-artifactory.volvocars.biz
  repository: ARTCSP-CI
  items:
    - path: common-build-workshop/playground/workshop_<CDSID>_1
      revision: 0.0.0
      toDir: from_project_1
      files:
        - name: files.tar.gz       
          name: singlefile_newname.txt 
```
> Task: Commit the files and push them to `HEAD:refs/for/master`. 
Navigate to [victoria.volvocars.biz](https://victoria.volvocars.biz) and check the build log. You should see the file listing with the dependent files downloaded prior to build start. Also verify the folders where the downloads are located. Also note that `files.tar.gz` is expanded into the `files`.

The `files` folder can be renamed by defining the `name` attribute on the dependency.

### default.xml - downloading dependent source repositories.

> Task: Create file: `default.xml` to consume source code from from your other project playground/workshop_<CDSID>_1.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest>
  <remote name="origin" fetch="ssh://csp-gerrit-ssh.volvocars.net" review=""/> 
  <default revision="master" remote="origin" sync-s="true" sync-j="4" sync-c="true"/>
  <project path="my_component_1" name="playground/workshop_<CDSID>_1.git" revision="refs/tags/v0.0.0"/>
</manifest>
```
> Task: Commit the files and push them to `HEAD:refs/for/master`. 
Navigate to [victoria.volvocars.biz](https://victoria.volvocars.biz) and check the build log. You should see the file listing with the dependent repositories downloaded prior to build start.



# Lesson 6 - Using secrets
Secrets are stored in Vault and Common-Build supports fetching secrets and mount them in a docker standard way when the docker container starts.

> Task: Navigate to [winterfell.csp-dev.net](https://winterfell.csp-dev.net/ui/vault/secrets/csp/show/playground) and create the secret `csp/playground/workshop_<CDSID>_1`. Then update your `build.yml` to define the secrets:

```yaml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.12.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        image1:
          image: ubuntu:20.04
      secrets:
        myTopSecret: csp/playground/workshop_<CDSID>_1
      commands:
        - cmd: | 
            export secret=$(cat /run/secrets/myTopSecret)
            echo Hello secret! $secret
```

> Task: Push the updated `build.yml` to `HEAD:refs/for/master` and verify that the build log in Cynosure contains the *"Hello secret: **\<TheSecretValue\>**"* 

# Lesson 7 - Creating and publishing a docker image
Common-Build supports the creation of Docker images. This will be highly used in the organization to create and maintain dockerized tool images.

> Task: Create a simple HelloWorld python script `hello.py` in the root of project `csp/playground/workshop_<CDSID>_1`

```python
#!/usr/bin/env python3
print("Hello world") 
```

> Task: Create the file `docker/Dockerfile`

```yaml
FROM ubuntu:20.04

RUN apt update && apt install -y python3

COPY build/hello.py /root/hello.py

```
> Task: Update the `build.yml` file

```yaml
toolImage: artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-agent:0.12.0
version: 1
build:
  steps:
    - type: compose
      nodes:
        image1:
          image: ubuntu:20.04
      commands:
        - cmd: | 
            echo Some fake build...
            mkdir build
            cp hello.py build #Just some fake build action.
            chmod +x build/hello.py
    - type: build
      name: playground/workshop_<CDSID>_1
      file: docker/Dockerfile
```
This will build and register the docker image in the local docker daemon. In order to publish the docker image, as part of the build, we need to add `.common-build/publish.yml`.

> Task: Add the `.common-build/publish.yml` file:

```yaml
images:
  remote: artcsp-docker.ara-artifactory.volvocars.biz
  items:
    - name: playground/workshop_<CDSID>_1
```

> Task: Commit all files and push it to `HEAD:refs/for/master`. Verify the build in Cynosure.

> Task: Test the image locally by running `docker run -it artcsp-docker.ara-artifactory.volvocars.biz/playground/workshop_<CDSID>_1:<GITSHA> /root/hello.py` 

Note: If you're not logged in to `artcsp-docker.ara-artifactory.volvocars.biz`, in the current terminal session, just execute `docker login -u <CSDID> -p <password> artcsp-docker.ara-artifactory.volvocars.biz` and retry.

> Task: Navigate to the Common-Build UI and select the `playground/workshop_<CDSID>_1` project in the drop-down menu. Goto the *State* section and hit * Release*.

> Task: Retry running the image by version name: `docker run -it artcsp-docker.ara-artifactory.volvocars.biz/playground/workshop_<CDSID>_1:0.3.0 /root/hello.py`

















