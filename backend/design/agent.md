# OneBuild Cynosure agent

## Resources

[Cynosure-test-builder](https://portal.azure.com/#@volvocars.onmicrosoft.com/resource/subscriptions/e307e0bf-5d5d-427c-9a08-c9875a5b9b93/resourceGroups/cynosure-test-builder_group/providers/Microsoft.Compute/virtualMachines/cynosure-test-builder/overview)

SSH: `ssh -i ~/.ssh/azureuser_rsa azureuser@10.40.206.24`

[Cynosure test project](https://csp-gerrit.volvocars.biz/plugins/gitiles/playground/cynosure_a)

## Process

1. Cynosure triggers action on Agent (In SSH shell on VM)
1. Checkout Git (Supported out of the box on Cynosure Agent. Already in test POC - project: playground/cynosure/cynosure_a)
1. Extract ToolDockerImage version from gate.yml.
1. Run ToolDockerImage:Version -> generate run script. Exit docker image.
1. Run generated script in Agent bash session.
1. If run-script fails -> verdict(fail) if succeeds verdict(succeed)

## Tasks

1. create test repo with gate.yml file having echo "Hello world"
1. check if the push to this repo triggers cynosure chain
1. create tool checkout repo
1. create tool to trigger jenkins job
1. create tool for downloading artifacts from jenkins run
1. create tool to extract build steps from gate.yml

1. create docker image for pre-build stage
	checkout git repo
	extract dependencies from gate.yml and generate a bash script on the commands to run for the build'
	If run-script fails -> verdict(fail) if succeeds verdict(succeed)
1. polling function that listens to signals from cynosure for a signal to trigger the build
1. post-build function that takes artifacts from build steps, locate them in gate-publish.yml and publish them to ara


## Runtime V1

Context: Just entered the Cynosure agent (ssh sesssion). $crt is available.

1. `$crt download source` (to local directory `source`) 
1. `commands=$(docker run -v source:/work -w /work -t tooling-image:version tooling-commands/generate-commands)`
1. `sh $commands`

Example generated (from gate.yml) commands:

```bash 
# Example of generated commands.

docker run -it tooling-image:version "workdir source" "tooling-commands/download-dependencies"

docker run -it team-image:version "workdir source" qnx compile source build/binaries

docker run -it signing-image:version "workdir source" sign build/binaries build/signed-binaries

docker run -it tooling-image:version "workdir source" tooling-commands/publish-artifacts
```

## Runtime 2

Context: Just entered the Cynosure agent (ssh sesssion). $crt is available.

1. `$crt download source` (to local directory `source`) 
1. `$(docker run -v source:/work -w /work -t tooling-image:version tooling-commands/run-onebuild-process)`

Example generated commands:

```bash 

tooling-commands/download-dependencies

docker run -it team-image:version "workdir source" qnx compile source build/binaries

docker run -it signing-image:version "workdir source" sign build/binaries build/signed-binaries

tooling-commands/publish-artifacts
```




