// Set default env vars required before any domain modules are loaded.
// payport-connection-name.ts reads these at module evaluation time.
process.env['PAYPORT_DB_WRITE_CONNECTION_NAME'] = process.env['PAYPORT_DB_WRITE_CONNECTION_NAME'] ?? 'payport_write';
process.env['PAYPORT_DB_READ_CONNECTION_NAME'] = process.env['PAYPORT_DB_READ_CONNECTION_NAME'] ?? 'payport_read';
