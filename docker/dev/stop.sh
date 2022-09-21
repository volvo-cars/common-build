#! /bin/bash
set -e
docker compose -f $PWD/docker/dev/docker-compose.yml down
