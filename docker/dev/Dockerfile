
FROM ubuntu:20.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update
RUN apt install -y \
    software-properties-common \
    curl \
    redis-tools \
    cloc \
    git \
    npm
RUN npm install npm@latest -g && \
    npm install n -g && \
    n latest

RUN echo "    ServerAliveInterval 30\n    ServerAliveCountMax 1\n" >> /etc/ssh/ssh_config
RUN echo "    AddressFamily inet\n" >> /etc/ssh/ssh_config

RUN useradd -m common-build
USER common-build
# PODMAN
#ENV VERSION_ID=20.04
#RUN echo "deb https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_${VERSION_ID}/ /" | tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list && \
#curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_${VERSION_ID}/Release.key | apt-key add - && \
#    apt-get update && \
#    apt-get -y install podman
