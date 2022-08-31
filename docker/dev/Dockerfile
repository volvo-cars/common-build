
FROM artcsp-docker.ara-artifactory.volvocars.biz/vcc/common-build-dev:0.5.0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update
RUN apt install -y \
    curl \
    redis-tools \
    cloc \
    git 

RUN echo "    ServerAliveInterval 30\n    ServerAliveCountMax 1\n    AddressFamily inet\n" >> /etc/ssh/ssh_config

RUN useradd -m common-build
USER common-build