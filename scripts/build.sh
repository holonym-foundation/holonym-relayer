#!/bin/bash

# Root directory of this project
REPO_DIR="$( cd "$( dirname "$0" )"/.. && pwd )"

docker build -f Dockerfile -t holonym-relayer $REPO_DIR
