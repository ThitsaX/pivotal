# app-auditor

`app-auditor` consumes audit events from NATS and persists transaction audit records into MySQL. It is the background process that makes Find Transactions and report downloads useful.

## Responsibilities

- Runs audit and participant database migrations at startup.
- Connects to NATS JetStream.
- Consumes Pivotal audit events from the configured audit stream.
- Inserts or updates audit transaction records in MySQL.
- Keeps transaction lifecycle fields available for portal search, details, and exports.
- Enforces JetStream retention limits on the streams it shares with the connectors, so stream
  storage stays bounded (MySQL is the system of record). A periodic in-process sweep tightens
  `max_age` on the audit stream and on the connector-owned `PIVOTAL_FSPIOP` stream — stream
  management is account-scoped, so app-auditor can bound a stream it neither produces nor
  consumes without any connector change. The sweep is idempotent and safe across replicas.

## Run Locally

```bash
cp packages/apps/app-auditor/.env.example packages/apps/app-auditor/.env
npm run start:apps-app-auditor:dev
```

This process does not expose an HTTP port. It runs as a Nest application context.

## Required Dependencies

- MySQL database with Pivotal audit and participant schemas.
- NATS JetStream with the Pivotal audit stream.
- Producers that publish audit events, mainly `web-outbound`, `web-inbound`, and connectors.

## Important Env Groups

- `NATS_URL`: audit stream connection.
- `PIVOTAL_AUDIT_STREAM_NAME`, `PIVOTAL_FSPIOP_STREAM_NAME`: stream names the retention enforcer
  targets; must match the names producers/connectors use.
- `PIVOTAL_{AUDIT,FSPIOP}_STREAM_MAX_AGE_MS` / `_MAX_BYTES`, `PIVOTAL_STREAM_LIMITS_ENFORCE_INTERVAL_MS`:
  JetStream retention limits and sweep cadence. All optional — the built-in code defaults apply
  when unset. `max_bytes` defaults to unlimited (`-1`) on purpose; age is the safe bound.
- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.

## Debug Checklist

- If Find Transactions is empty, check this service is running before checking the portal UI.
- If events are published but not stored, inspect NATS stream, durable consumer, and DB write errors.
- If audit rows are duplicated, check correlation/transfer ID handling in producers and repository upsert logic.
- If payer/payee fields are missing, inspect the source audit event payload before changing SQL.
- If startup fails, check DB connectivity and migration history tables.
- If the JetStream PVC keeps growing, confirm this service is running and its stream-limits sweep
  logged `Reconciled retention on stream='PIVOTAL_FSPIOP'`. The sweep only sets `max_age`; the
  NATS server then purges aged messages continuously (an app-auditor outage never deletes data).
