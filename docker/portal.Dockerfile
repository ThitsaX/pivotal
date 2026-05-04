# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /app
COPY packages/portal/package*.json ./packages/portal/
RUN npm --prefix packages/portal ci
COPY packages/portal ./packages/portal
COPY packages/shared ./packages/shared
ARG VITE_WEB_PIVOTAL_API_BASE_URL
ENV VITE_WEB_PIVOTAL_API_BASE_URL=${VITE_WEB_PIVOTAL_API_BASE_URL}
RUN npm --prefix packages/portal run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/packages/portal/dist ./
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
