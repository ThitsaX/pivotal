# web-outbound

`web-outbound` is the payer-facing API. It starts the send-money flow, calls Mojaloop Hub services, waits for correlated callbacks from `web-inbound`, and stores temporary transfer state in Redis.

## Responsibilities

- Exposes `POST /secured/sendmoney` to start party lookup.
- Exposes `PUT /secured/sendmoney/{transferId}` for `acceptParty` and `acceptQuote`.
- Calls Hub `GET /parties`, `POST /quotes`, and `POST /transfers`.
- Subscribes to the FSPIOP response stream published by `web-inbound`.
- Uses Redis for in-flight transfer state and callback timeout tracking.
- Validates optional payer JWT access tokens when `ACCESS_JWT_ENABLED=true`.

## Run Locally

```bash
cp packages/apps/web-outbound/.env.example packages/apps/web-outbound/.env
npm run start:apps-web-outbound:dev
```

Default port: `3200`.

Swagger docs: `http://localhost:3200/v1.0.0/api-docs`.

## Required Dependencies

- MySQL database with Pivotal tables.
- Redis for transfer state.
- NATS JetStream for callback correlation.
- Mojaloop Hub endpoints: ALS, quoting-service, ml-api-adapter, and central-ledger.
- Participant/key data in Pivotal DB when JWS or participant validation is enabled.

## Important Env Groups

- `WEB_OUTBOUND_PORT`: HTTP listen port.
- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.
- `NATS_URL`: response stream connection.
- `REDIS_URL`, `REDIS_CACHE_ITEM_TIMEOUT_MS`: temporary transfer state.
- `FSPIOP_*_URL`: Hub parties, quotes, and transfers endpoints.
- `FSPIOP_SWITCH_ID`: Hub FSP ID expected in FSPIOP headers.
- `FSPIOP_USE_JWS`, `FSPIOP_USE_MUTUAL_TLS`: outbound Hub security switches.
- `PIVOTAL_FSPIOP_RESPONSE_STREAM_NAME`: must match `web-inbound`.
- `ACCESS_JWT_ENABLED`: protects send-money API with payer JWTs.
- `DECIMAL_PLACES`: amount scale validation.

## Debug Checklist

- If a request times out with "Callback not received", check `web-inbound` is running and both services use the same `PIVOTAL_FSPIOP_RESPONSE_STREAM_NAME`.
- If lookup is fast but quote/transfer is slow, check Hub quoting and ml-api-adapter logs first.
- If authorization succeeds with the wrong DFSP, verify `FSPIOP-Source` and JWT key ownership in participant records.
- If amounts are rejected, check `DECIMAL_PLACES` and whether the request sends number or string amount values.
- If callbacks arrive but the API still times out, inspect Redis keys and NATS durable/stream state.
