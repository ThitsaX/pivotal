# Helm Chart: pivotal-stack

This chart reproduces the services from `docker/docker-compose.yml`:

- `mysql`
- `nats`
- `redis`
- `web-inbound`
- `web-outbound`
- `web-pivotal`
- `report-worker`
- `portal`
- `app-auditor`
- `wallet1-connector`
- `wallet2-connector`
- `wallet3-connector`

## Install

```bash
helm upgrade --install pivotal-stack ./helm
```

## Override images

```bash
helm upgrade --install pivotal-stack ./helm \
  --set webInbound.image.repository=my-registry/pivotal-web-inbound \
  --set webInbound.image.tag=v1.0.0 \
  --set webOutbound.image.repository=my-registry/pivotal-web-outbound \
  --set webOutbound.image.tag=v1.0.0
```

## Disable a component

```bash
helm upgrade --install pivotal-stack ./helm --set wallet3Connector.enabled=false
```

## Customize environment values

```bash
helm upgrade --install pivotal-stack ./helm \
  --set global.commonFspiopEnv.FSPIOP_SWITCH_ID=hub \
  --set global.commonDbEnv.DB_WRITE_HOST=mysql \
  --set webPivotal.env.CENTRAL_LEDGER_URL=http://central-ledger:3001
```
