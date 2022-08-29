FROM ubuntu:20.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-setuptools \
    openssh-client \
    git \
    sudo \
    apt-transport-https \
    ca-certificates \
    curl \
    gcc \
    g++ \
    sshpass \
    cloud-init \
    && apt-get clean

COPY requirements.txt requirements.txt

RUN pip3 install ansible==5.3.0
RUN pip3 install -r requirements.txt
RUN ansible-galaxy collection install azure.azcollection

COPY secrets secrets

#RUN cat secrets >> ~/.bashrc