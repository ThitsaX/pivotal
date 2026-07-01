# app-auditor

`app-auditor` consumes audit events from NATS and persists transaction audit records into MySQL. It is the background process that makes Find Transactions and report downloads useful.

## Responsibilities

- Runs audit and participant database migrations at startup.
- Connects to NATS JetStream.
- Consumes Pivotal audit events from the configured audit stream.
- Inserts or updates audit transaction records in MySQL.
- Keeps transaction lifecycle fields available for portal search, details, and exports.

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
- `PIVOTAL_AUDIT_STREAM_NAME`: audit stream name; must match producers.
- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.

## Debug Checklist

- If Find Transactions is empty, check this service is running before checking the portal UI.
- If events are published but not stored, inspect NATS stream, durable consumer, and DB write errors.
- If audit rows are duplicated, check correlation/transfer ID handling in producers and repository upsert logic.
- If payer/payee fields are missing, inspect the source audit event payload before changing SQL.
- If startup fails, check DB connectivity and migration history tables.
