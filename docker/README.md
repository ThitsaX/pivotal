# Docker Compose Stack

This folder contains a complete Docker Compose stack for:
- `portal` (Vue UI)
- `web-pivotal` (portal API backend)
- `app-auditor`
- `web-inbound`
- `web-outbound`
- `wallet1-connector`
- `wallet2-connector`
- `wallet3-connector`
- `postgres`
- `nats`
- `redis`

## 1) Run everything

```bash
cd docker
cp .env.example .env
docker compose up -d --build
```

Stop:

```bash
cd docker
docker compose down
```

Stop and remove DB/cache data volumes:

```bash
cd docker
docker compose down -v
```

## 2) Default endpoints

- Portal UI: `http://localhost:4173`
- Web Pivotal API: `http://localhost:3202`
- Web Outbound API: `http://localhost:3200`
- Web Inbound API: `http://localhost:3201`
- PostgreSQL: `localhost:5432`
- NATS: `localhost:4222`
- NATS monitor: `http://localhost:8222`
- Redis: `localhost:6379`

## 3) Configuration

`docker/.env` is the Docker-side options file. Key defaults:
- DB host is `postgres` for app containers.
- NATS URL is `nats://nats:4222`.
- Redis URL is `redis://redis:6379`.
- FSPIOP callback URLs point to `web-inbound` inside the Docker network.

Update values in `docker/.env`, then rebuild/restart:

```bash
cd docker
docker compose up -d --build
```

## 4) External dependencies

- Wallet connectors use `CATALYST_URL` (default: `http://host.docker.internal:4000`).
- `web-pivotal` uses `CENTRAL_LEDGER_URL` (default: `http://host.docker.internal:3001`).

If those services are not running on your host machine, update the URLs in `docker/.env`.
