# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run build:apps-web-pivotal

FROM dependencies AS production-dependencies
WORKDIR /app
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/core/audit/domain/sql ./packages/core/audit/domain/sql
COPY --from=builder /app/packages/core/auth/domain/sql ./packages/core/auth/domain/sql
COPY --from=builder /app/packages/core/participant/domain/sql ./packages/core/participant/domain/sql
EXPOSE 3202
CMD ["node", "dist/packages/apps/web-pivotal/main.js"]
