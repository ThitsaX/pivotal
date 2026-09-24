# syntax=docker/dockerfile:1.7

# Debian rather than Alpine because this service signs through PKCS#11.
#
# A PKCS#11 module is a C shared object, and every one that matters here -- the
# AWS CloudHSM client library, SoftHSM from the Debian archive -- is built
# against glibc. Alpine is musl, so loading one there fails at relocation time
# with a missing glibc symbol rather than with anything that names the cause.
# The cost of the move is about 18MB in the final image.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
# node-gyp compiles the PKCS#11 binding from source; no prebuilt binary exists
# for it. Only this stage needs a compiler -- the runtime stage below starts
# from a clean base and copies nothing but the built node_modules.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build:apps-web-outbound

FROM dependencies AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Which PKCS#11 module to put in the image.
#
#   none     KMS-backed profile -- signing is in-process, no module involved
#   softhsm  HSM-backed profile rehearsed against SoftHSM, for a development
#            cluster with no hardware behind it
#
# CloudHSM is deliberately absent: its client SDK is not in any public
# repository, it is downloaded per region and per version from AWS, and it
# carries a cluster certificate specific to one deployment. That layer belongs
# to the deployment that holds those, not to this file.
ARG PKCS11_BACKEND=none
RUN if [ "$PKCS11_BACKEND" = "softhsm" ]; then \
      apt-get update \
   && apt-get install -y --no-install-recommends softhsm2 \
   && rm -rf /var/lib/apt/lists/*; \
    fi

COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3200
CMD ["node", "dist/packages/apps/web-outbound/main.js"]
