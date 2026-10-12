-- Legacy sessions cannot acquire a new absolute deadline through refresh.
ALTER TABLE `refresh_tokens` ADD COLUMN `session_expires_at` DATETIME(3) NULL AFTER `expires_at`;
UPDATE `refresh_tokens`
SET `expires_at` = LEAST(`expires_at`, UTC_TIMESTAMP()),
    `revoked_at` = COALESCE(`revoked_at`, UTC_TIMESTAMP())
WHERE `session_expires_at` IS NULL;
