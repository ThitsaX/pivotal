# web-pivotal

`web-pivotal` is the portal and administration API. It owns IAM, participant setup, audit search, transaction details, and the authenticated report download API.

## Responsibilities

- Runs audit, auth, and participant database migrations at startup.
- Seeds IAM roles, permissions, menus, and the configured admin user.
- Exposes login, refresh, logout, password change, and current-user APIs.
- Exposes participant onboarding, endpoint, currency, and signing-key APIs.
- Exposes Find Transactions, transaction detail, count, and report download APIs.
- Streams generated report ZIP files to authenticated users through the API; it must not expose direct S3 URLs to the portal.

## Run Locally

```bash
cp packages/apps/web-pivotal/.env.example packages/apps/web-pivotal/.env
npm run start:apps-web-pivotal:dev
```

Default port: `3202`.

Health endpoints:

```text
GET /healthz
GET /readyz
```

## Main Route Groups

- `/auth/*`: login, refresh, logout, password change.
- `/auth/me/*`: current user and menu.
- `/admin/*`: IAM users, roles, menus, and permissions.
- `/participant/*`: onboarding, endpoints, currencies, and participant signing keys.
- `/hub/*`: Hub currency and signing-key setup.
- `/audit/transactions`: Find Transactions, count, and detail.
- `/audit/transactions/reports`: report request, status, download URL, and download stream.

## Required Dependencies

- MySQL database with Pivotal audit, auth, and participant schemas.
- Central Ledger API for participant-related Hub operations.
- S3 or MinIO for report download proxy reads.
- `report-worker` for asynchronous report generation in normal deployments.

## Important Env Groups

- `WEB_PIVOTAL_PORT`: HTTP listen port.
- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.
- `CENTRAL_LEDGER_URL`: Hub participant/admin API base URL.
- `PIVOTAL_IAM_JWT_SECRET`: signing secret for portal JWTs.
- `PIVOTAL_IAM_ADMIN_SEED_EMAIL`, `PIVOTAL_IAM_ADMIN_SEED_TEMP_PASSWORD`: initial admin user.
- `PIVOTAL_IAM_CORS_ALLOWED_ORIGINS`: allowed portal origins.
- `AUDIT_MAX_RESULT_ROWS`: Find Transactions search/count cap.
- `REPORT_DOWNLOAD_WORKER_ENABLED`: keep `false` when a dedicated `report-worker` is running.
- `REPORT_S3_*`: bucket, region, credentials, endpoint, path-style flag, and key prefix.

## Report Download Notes

`web-pivotal` creates queued report requests and serves download streams. The heavy XLSX/ZIP generation should run in `report-worker`, not inside this HTTP process.

For local MinIO, use:

```text
REPORT_S3_ENDPOINT=http://127.0.0.1:9000
REPORT_S3_FORCE_PATH_STYLE=true
```

For AWS S3, leave `REPORT_S3_ENDPOINT` empty and set the real bucket, region, access key, and secret key through deployment secrets.

## Debug Checklist

- If login works but refresh fails in browser, check `PIVOTAL_IAM_CORS_ALLOWED_ORIGINS` and the portal API base URL.
- If reports stay `PENDING`, check that `report-worker` is running and `REPORT_DOWNLOAD_WORKER_ENABLED=true` there.
- If reports fail with `SignatureDoesNotMatch`, compare S3 secret key, bucket region, endpoint, and path-style settings.
- If downloads fail after status is `READY`, verify `web-pivotal` has the same S3 read credentials as `report-worker`.
- If Find Transactions misses records, check `app-auditor` and audit table data before changing portal filters.
