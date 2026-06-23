# web-inbound

`web-inbound` receives Mojaloop FSPIOP callbacks and incoming Hub requests. It validates inbound FSPIOP security when enabled, publishes connector work to NATS, and publishes correlated responses back to `web-outbound`.

## Responsibilities

- Receives Hub party requests and party callbacks under `/parties`.
- Receives Hub quote requests and quote callbacks under `/quotes`.
- Receives Hub transfer requests, transfer callbacks, and transfer patches under `/transfers`.
- Publishes connector work for wallets or backend adapters through NATS.
- Publishes FSPIOP responses to the shared response stream consumed by `web-outbound`.
- Can enforce JWS and mTLS for inbound FSPIOP traffic.

## Run Locally

```bash
cp packages/apps/web-inbound/.env.example packages/apps/web-inbound/.env
npm run start:apps-web-inbound:dev
```

Default port: `3201`.

## Main Routes

- `GET /parties/:type/:id{/:subId}`
- `PUT /parties/:type/:id{/:subId}`
- `PUT /parties/:type/:id{/:subId}/error`
- `POST /quotes`
- `PUT /quotes/:quoteId`
- `PUT /quotes/:quoteId/error`
- `POST /transfers`
- `PUT /transfers/:transferId`
- `PUT /transfers/:transferId/error`
- `PATCH /transfers/:transferId`

## Required Dependencies

- MySQL database with Pivotal participant and audit tables.
- NATS JetStream for connector work and callback correlation.
- Central Ledger API for Hub participant data where needed.
- JWS keys and mTLS material when FSPIOP security is enabled.

## Important Env Groups

- `WEB_INBOUND_PORT`: HTTP listen port.
- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.
- `NATS_URL`: connector and response stream connection.
- `PIVOTAL_FSPIOP_RESPONSE_STREAM_NAME`: must match `web-outbound`.
- `FSPIOP_SWITCH_ID`: expected Hub FSP ID.
- `FSPIOP_USE_JWS`: enables inbound JWS verification.
- `FSPIOP_USE_MUTUAL_TLS`: enables HTTPS mTLS listener.
- `FSPIOP_JWS_*`, `FSPIOP_MTLS_*`: security key and certificate values.

## Debug Checklist

- If Hub callbacks are visible but `web-outbound` times out, check the response stream name and NATS connectivity.
- If connector messages are missing, inspect NATS streams and connector subscriptions.
- If inbound requests fail before controller logs, check JWS/mTLS settings and key material.
- If party/quote/transfer payloads look incomplete, compare the incoming Hub payload with what the connector receives from NATS.
- If local HTTP cannot connect after enabling mTLS, use `https://` and provide client certificates.
