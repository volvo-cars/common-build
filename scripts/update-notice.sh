#!/bin/sh

set -ex

SCRIPT_DIR=$(dirname "$0")

updaten_notice() {
    cd "$1"
    rm -rf node_modules
    npm install
    npx @houdiniproject/noticeme -u
    if grep -qF 'GENERAL PUBLIC LICENSE' NOTICE && ! patch -p0 < ../scripts/gpl-not-accepted.patch; then
        echo "Found GENERAL PUBLIC LICENSE in NOTICE - you need to update the gpl-not-accepted.patch file"
        return 1
    fi
    cd -
}

updaten_notice "$SCRIPT_DIR/../backend"
updaten_notice "$SCRIPT_DIR/../frontend"
