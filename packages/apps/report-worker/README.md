# report-worker

`report-worker` is a background process for transaction report downloads. It claims queued jobs created by `web-pivotal`, reads audit data in batches, creates XLSX files, zips them, uploads the ZIP to S3 or MinIO, and updates job status.

## Responsibilities

- Polls `report_download_requests` for queued work.
- Claims jobs with bounded concurrency.
- Recovers stale running jobs after the configured TTL.
- Replays the saved search criteria from `report_download_request_params`.
- Reads audit transactions with keyset pagination.
- Splits XLSX files by configured row cap.
- Compresses generated files into one ZIP.
- Uploads ZIP files to S3 or MinIO.
- Updates request status to `READY` or `FAILED`.

## Run Locally

```bash
cp packages/apps/report-worker/.env.example packages/apps/report-worker/.env
npm run start:apps-report-worker:dev
```

This process does not expose an HTTP port. It runs as a Nest application context.

## Required Dependencies

- MySQL database with Pivotal audit and report download tables.
- S3-compatible object storage: AWS S3 in deployed environments or MinIO locally.
- `web-pivotal` to create jobs and proxy downloads to portal users.

## Important Env Groups

- `DB_WRITE_*`, `DB_READ_*`: Pivotal MySQL connections.
- `REPORT_DOWNLOAD_WORKER_ENABLED`: must be `true` for this process.
- `REPORT_DOWNLOAD_POLL_INTERVAL_MS`: how often the worker checks for queued jobs.
- `REPORT_DOWNLOAD_PAGE_SIZE`: DB batch size when reading report rows.
- `REPORT_DOWNLOAD_MAX_ROWS_PER_FILE`: XLSX split threshold.
- `REPORT_DOWNLOAD_MAX_ZIP_FILES`: maximum number of XLSX files per ZIP.
- `REPORT_DOWNLOAD_MAX_CONCURRENT`: maximum jobs processed at once.
- `REPORT_DOWNLOAD_STALE_RUNNING_TTL_MS`: stale job recovery threshold.
- `REPORT_S3_*`: bucket, region, credentials, endpoint, path-style flag, key prefix, and URL TTL.

## Job State Flow

```text
PENDING -> PROCESSING -> READY
PENDING -> PROCESSING -> FAILED
PROCESSING -> PENDING when stale recovery requeues the job
```

## Local MinIO Settings

```text
REPORT_S3_ENABLED=true
REPORT_S3_BUCKET=pivotal-reports
REPORT_S3_REGION=us-east-1
REPORT_S3_ACCESS_KEY_ID=minioadmin
REPORT_S3_SECRET_ACCESS_KEY=minioadmin
REPORT_S3_ENDPOINT=http://127.0.0.1:9000
REPORT_S3_FORCE_PATH_STYLE=true
```

## Debug Checklist

- If status is always `PENDING`, confirm this worker is running and `REPORT_DOWNLOAD_WORKER_ENABLED=true`.
- If status becomes `FAILED`, inspect worker logs first; `web-pivotal` only reports the stored failure.
- If upload fails with `SignatureDoesNotMatch`, the secret key is usually wrong or mismatched with the access key.
- If AWS upload fails with region errors, confirm the bucket region and `REPORT_S3_REGION`.
- If local MinIO upload fails, confirm the bucket exists and `REPORT_S3_FORCE_PATH_STYLE=true`.
- If report generation affects API latency, confirm generation is running here and not inside `web-pivotal`.
