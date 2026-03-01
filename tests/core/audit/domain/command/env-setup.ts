// Set default env vars required before any domain modules are loaded.
// mtpa-connection-name.ts reads these at module evaluation time.
process.env['MTPA_DB_WRITE_CONNECTION_NAME'] = process.env['MTPA_DB_WRITE_CONNECTION_NAME'] ?? 'mtpa_write';
process.env['MTPA_DB_READ_CONNECTION_NAME'] = process.env['MTPA_DB_READ_CONNECTION_NAME'] ?? 'mtpa_read';
