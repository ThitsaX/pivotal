# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build:apps-app-auditor

FROM dependencies AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/packages/apps/app-auditor/main.js"]
