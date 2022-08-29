#! /bin/bash
export CURRENT_DIR=$(pwd)
docker-compose  -f $CURRENT_DIR/docker/dev/docker-compose.yml down
