
FROM artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-dev:0.7.0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update
RUN apt install -y \
    redis-tools \
    cloc 

RUN echo "    ServerAliveInterval 30\n    ServerAliveCountMax 1\n" >> /etc/ssh/ssh_config

RUN npm install -g serve

RUN useradd -m common-build
USER common-build