# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
# The PKCS#11 binding is a root dependency and has no prebuilt binary, so every install
# compiles it -- including here, where nothing ever calls it. The alternative is making
# it optional, which would leave the services that DO sign silently without it whenever
# a build host lacked a compiler. The toolchain stays in this stage; the runtime stage
# below starts from a clean base and copies only the built node_modules.
RUN apk add --no-cache --virtual .build python3 make g++
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build:apps-report-worker

FROM dependencies AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/packages/apps/report-worker/main.js"]
