# syntax=docker/dockerfile:1.7

# The HSM admin pod: where a custodian runs the CA ceremony and provisions each DFSP's key.
#
# Every tool is pinned, so every custodian runs the version these procedures were tested with.
# Nothing secret is in the image. The cluster's certificate is mounted at runtime, the HSM address
# comes from the environment, and the Crypto Officer login and Vault token are typed in for each
# session.
#
# Ubuntu 24.04 rather than Alpine: the CloudHSM client is built against glibc.
FROM ubuntu:24.04

ARG CLOUDHSM_VERSION=5.18.0-1
ARG VAULT_VERSION=1.13.1

RUN set -eu; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates wget unzip openssl libengine-pkcs11-openssl opensc; \
    cd /tmp; \
    base=https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Noble; \
    wget -q "$base/cloudhsm-cli_${CLOUDHSM_VERSION}_u24.04_amd64.deb"; \
    wget -q "$base/cloudhsm-pkcs11_${CLOUDHSM_VERSION}_u24.04_amd64.deb"; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      "./cloudhsm-cli_${CLOUDHSM_VERSION}_u24.04_amd64.deb" \
      "./cloudhsm-pkcs11_${CLOUDHSM_VERSION}_u24.04_amd64.deb"; \
    wget -q "https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_linux_amd64.zip"; \
    wget -q "https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_SHA256SUMS"; \
    grep " vault_${VAULT_VERSION}_linux_amd64.zip\$" "vault_${VAULT_VERSION}_SHA256SUMS" | sha256sum -c -; \
    unzip -q "vault_${VAULT_VERSION}_linux_amd64.zip" -d /usr/local/bin; \
    rm -f /tmp/*.deb /tmp/*.zip /tmp/*SHA256SUMS; \
    apt-get purge -y wget unzip; apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*

# A custodian works as an ordinary user. The client writes its configuration under
# /opt/cloudhsm/etc when the entrypoint points it at the cluster, so that directory is theirs.
RUN useradd --uid 10001 --create-home custodian \
 && chown -R custodian:custodian /opt/cloudhsm/etc

COPY docker/hsm-tools-entrypoint.sh /usr/local/bin/hsm-tools-entrypoint.sh
COPY docs/operations/hsm/setup/scripts/ceremony-hsm.sh /usr/local/bin/ceremony-hsm.sh
COPY docs/operations/hsm/runbooks/scripts/provision-hsm-tenant.sh /usr/local/bin/provision-hsm-tenant.sh
RUN chmod 0755 /usr/local/bin/hsm-tools-entrypoint.sh /usr/local/bin/ceremony-hsm.sh \
      /usr/local/bin/provision-hsm-tenant.sh

ENV PATH=/opt/cloudhsm/bin:$PATH
USER custodian
WORKDIR /home/custodian
ENTRYPOINT ["/usr/local/bin/hsm-tools-entrypoint.sh"]
CMD ["sleep", "infinity"]
