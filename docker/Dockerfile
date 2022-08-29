
FROM artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-dev:0.5.0 as base

RUN mkdir /common-build

FROM base as backend
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update
RUN apt install -y \
    redis-tools \
    cloc \
    git 
RUN echo "    ServerAliveInterval 30\n    ServerAliveCountMax 1\n" >> /etc/ssh/ssh_config
RUN echo "    AddressFamily inet\n" >> /etc/ssh/ssh_config
COPY backend/node_modules /common-build/node_modules
COPY backend/build/src /common-build/js
COPY backend/config-local.yaml /common-build
RUN echo "#! /bin/bash \n node /common-build/js/index.js --config /common-build/config-local.yaml \"\$@\"" > /usr/bin/common-build && chmod +x /usr/bin/common-build

FROM base as frontend
COPY frontend/node_modules /common-build/node_modules
COPY frontend/build /common-build/app
#RUN echo "#! /bin/bash \n node /common-build/app/index.js \"\$@\"" > /usr/bin/common-build && chmod +x /usr/bin/common-build

