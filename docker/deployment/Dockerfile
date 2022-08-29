FROM ubuntu:20.04

RUN apt update && apt install -y \
    software-properties-common curl
RUN apt install npm -y
RUN npm install npm@latest -g && \
    npm install n -g && \
    n latest

COPY build/certs/ /usr/local/share/ca-certificates/
RUN chmod 644 /usr/local/share/ca-certificates/*.crt && \
    update-ca-certificates

COPY build/app /app

# PODMAN
#ENV VERSION_ID=20.04 
#RUN echo "deb https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_${VERSION_ID}/ /" | tee /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list && \
#curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_${VERSION_ID}/Release.key | apt-key add - && \
#    apt-get update && \
#    apt-get -y install podman
