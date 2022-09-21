#! /bin/bash
set -e

docker compose -f $PWD/docker/dev/docker-compose.yml up --detach --force-recreate --remove-orphans 
echo Started containers. Use docker/dev/enter.sh container-name to enter a container
docker ps
