# Docker images for apps

This folder contains Docker setup for:
- `app-auditor`
- `web-outbound`
- `web-inbound`

## 1) Build images

```bash
cd docker
docker compose build web-outbound web-inbound
```

## 2) Run with each app's `.env` values (default)

```bash
cd docker
cp .env.example .env
docker compose up -d
```

`docker/.env` is the Docker-side options file. It now includes all required variable names for `web-outbound` and `web-inbound` such as:
- `FSPIOP_USE_JWS`
- `FSPIOP_PARTIES_URL`
- `FSPIOP_QUOTES_URL`
- `FSPIOP_TRANSFERS_URL`
- `NATS_URL`
- `FSPIOP_SWITCH_ID`

Update values in `docker/.env` and restart:

```bash
cd docker
docker compose up -d --build
```

## 3) Build/run individual image (without compose)

Run these commands from the repository root (`/Users/aungthawaye/Development/ThitsaWorks/mtpa`) so Docker can include `package-lock.json` in the build context.

```bash
docker build -f docker/web-outbound.Dockerfile -t pivotal-web-outbound:local .
docker run --rm --env-file packages/apps/web-outbound/.env -p 3200:3200 pivotal-web-outbound:local
```

```bash
docker build -f docker/web-inbound.Dockerfile -t pivotal-web-inbound:local .
docker run --rm --env-file packages/apps/web-inbound/.env -p 3201:3201 pivotal-web-inbound:local
```

```bash
docker build -f docker/app-auditor.Dockerfile -t pivotal-app-auditor:local .
docker run --rm --env-file packages/apps/app-auditor/.env pivotal-app-auditor:local
```

## 4) Build/run wallet connector images

Run these commands from the repository root (`/Users/aungthawaye/Development/ThitsaWorks/mtpa`).

```bash
docker build -f docker/wallet1-connector.Dockerfile -t pivotal-wallet1-connector:local .
docker run --rm --env-file packages/samples/wallet1-connector/.env pivotal-wallet1-connector:local
```

```bash
docker build -f docker/wallet2-connector.Dockerfile -t pivotal-wallet2-connector:local .
docker run --rm --env-file packages/samples/wallet2-connector/.env pivotal-wallet2-connector:local
```

## 5) Build and push all images (Docker Hub or GHCR)

Use the helper script from the repository root (`/Users/aungthawaye/Development/ThitsaWorks/mtpa`):

```bash
docker login
./docker/build-and-push.sh --namespace <dockerhub_user> --version 1.0.0
```

For GHCR:

```bash
echo "<GITHUB_PAT>" | docker login ghcr.io -u <github_user> --password-stdin
./docker/build-and-push.sh --registry ghcr.io --namespace <github_user_or_org> --version 1.0.0
```
