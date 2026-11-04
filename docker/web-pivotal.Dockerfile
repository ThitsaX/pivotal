# syntax=docker/dockerfile:1.7

# Debian rather than Alpine because this service generates keys through PKCS#11.
#
# It hosts the onboarding handler, so it is what creates a tenant's signing key inside the
# device. A PKCS#11 module is a C shared object, and every one that matters here -- the AWS
# CloudHSM client library, SoftHSM from the Debian archive -- is built against glibc. Alpine is
# musl, so loading one there fails at relocation time with a missing glibc symbol rather than
# with anything that names the cause. The cost of the move is about 18MB in the final image.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
# node-gyp compiles the PKCS#11 binding from source; no prebuilt binary exists for it. Only
# this stage needs a compiler -- the runtime stage below starts from a clean base and copies
# nothing but the built node_modules.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build:apps-web-pivotal

FROM dependencies AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Which PKCS#11 module to put in the image.
#
#   none     KMS-backed profile -- keys are generated in software, no module involved
#   softhsm  HSM-backed profile rehearsed against SoftHSM, for a development
#            cluster with no hardware behind it
#
# The library only. What ties a client to one cluster is its certificate and the
# HSM address, and neither belongs in an image: the certificate is created when
# that cluster is activated, and the address differs per environment. Both are
# supplied at startup -- the certificate mounted where the library looks for it,
# the address through the entrypoint below.
ARG PKCS11_BACKEND=none
# The Jammy build, not Noble. AWS builds each package against its distribution's glibc, and
# Noble's needs 2.38 while this image is Debian 12 at 2.36 -- the mismatch is not caught at
# install time, only when something in /opt/cloudhsm is first executed. Jammy targets 2.35,
# which this image satisfies.
ARG CLOUDHSM_SDK_URL=https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Jammy/cloudhsm-pkcs11_latest_u22.04_amd64.deb
RUN set -eu; \
    if [ "$PKCS11_BACKEND" = "softhsm" ]; then \
      apt-get update \
   && apt-get install -y --no-install-recommends softhsm2 \
   && rm -rf /var/lib/apt/lists/*; \
    elif [ "$PKCS11_BACKEND" = "cloudhsm" ]; then \
      apt-get update \
   && apt-get install -y --no-install-recommends wget ca-certificates \
   && wget -q -O /tmp/cloudhsm-pkcs11.deb "$CLOUDHSM_SDK_URL" \
   && apt-get install -y --no-install-recommends /tmp/cloudhsm-pkcs11.deb \
   && rm -f /tmp/cloudhsm-pkcs11.deb \
   && apt-get purge -y wget && apt-get autoremove -y \
   && rm -rf /var/lib/apt/lists/*; \
    fi

COPY docker/pkcs11-entrypoint.sh /usr/local/bin/pkcs11-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/pkcs11-entrypoint.sh"]

COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/core/audit/domain/sql ./packages/core/audit/domain/sql
COPY --from=builder /app/packages/core/auth/domain/sql ./packages/core/auth/domain/sql
COPY --from=builder /app/packages/core/participant/domain/sql ./packages/core/participant/domain/sql
EXPOSE 3202
CMD ["node", "dist/packages/apps/web-pivotal/main.js"]
