#! /bin/bash
export CURRENT_DIR=$(pwd)

#docker run -v $CURRENT_DIR:/work -v $HOME/.ssh:/root_ssh -w /work -e USER -e VAULT_TOKEN -it onebuild-dev:latest /bin/bash #

docker-compose -f $CURRENT_DIR/docker/dev/docker-compose.yml up --detach --force-recreate --remove-orphans 
echo Started containers. Use docker/dev/enter.sh container-name to enter a container
docker ps
