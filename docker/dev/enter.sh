#! /bin/bash
set -e
echo "Usage enter.sh frontend|backend"

containerId=$(docker ps -aqf "name=$1")
echo Entering dev-container $1: $containerId
docker exec -w /work -it $containerId /bin/bash