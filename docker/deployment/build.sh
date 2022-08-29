#! /bin/bash
export RELPATH=`dirname "$0"`
export WORKDIR=$(pwd)
export DOCKERDIR=$WORKDIR/$RELPATH  

docker run -v $WORKDIR:/work --workdir /work -it common-build-dev:latest bash -c "npm install && npm run build && mkdir build/node_modules && cp package*.json build && npm install --production --prefix ./build"
export LOCAL_BUILD_DIR=$DOCKERDIR/build

echo Fresh copy app files to $LOCAL_BUILD_DIR
rm -rf $LOCAL_BUILD_DIR && mkdir -p $LOCAL_BUILD_DIR
export APP_DIR=$LOCAL_BUILD_DIR/app
mkdir -p $APP_DIR

cp -r $WORKDIR/build/src $APP_DIR/dist
cp -r $WORKDIR/build/node_modules $APP_DIR/node_modules
cp -r $WORKDIR/package*.json $APP_DIR  
cp -r $WORKDIR/config-local.yaml $APP_DIR  

echo Copying certs from dev
cp -r $WORKDIR/docker/dev/cert/ $LOCAL_BUILD_DIR/certs

docker build -t common-build:latest $(dirname "$0")