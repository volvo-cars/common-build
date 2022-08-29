#! /bin/bash
export CURRENT_DIR=$(pwd)

docker-compose -f $CURRENT_DIR/docker/deployment/docker-compose.yml up  
