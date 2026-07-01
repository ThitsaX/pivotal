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

## Transfer Patch Flow

`PATCH /transfers/:transferId` receives Hub transfer patch callbacks. The route does not complete the original payer `/sendmoney` call directly; it forwards the patch to the payee connector over NATS.

Runtime behavior:

1. Read `traceparent` as the audit correlation ID when present, falling back downstream to the transfer ID.
2. Read `FSPIOP-Source` and `FSPIOP-Destination` as payer/payee context for the patch event.
3. Publish `HandlePatchTransfersCommand` to the inbound domain.
4. The inbound handler publishes a connector patch-transfer message to the payee connector subject.
5. The connector invokes the backend adapter's `patchTransfers` method.
6. The connector publishes patch request, response, or error audit events.

Patch audit fields are stored on the transaction as `patch_requested_at`, `patch_responded_at`, `patch_request`, and `patch_error`. Patch errors mark the transaction as possible dispute for Find Transactions and report exports.

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
