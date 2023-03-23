#!/bin/bash

# Root directory of this project
REPO_DIR="$( cd "$( dirname "$0" )"/.. && pwd )"

docker build -f Dockerfile -t holonym-relayer $REPO_DIR
printf "\n"
docker run --env-file $REPO_DIR/.env -p 6969:6969 holonym-relayer
