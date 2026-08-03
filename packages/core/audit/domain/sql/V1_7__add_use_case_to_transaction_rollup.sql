-- Add use case to the hourly dashboard grain so value can be broken down by sub-scenario
-- without scanning the raw transaction table. Existing aggregate rows cannot be split reliably,
-- so clear them and let the app-auditor startup backfill rebuild the last 30 days from source.
ALTER TABLE `transaction_hourly_rollup`
    DROP PRIMARY KEY,
    ADD COLUMN `sub_scenario` VARCHAR(128) NOT NULL DEFAULT 'UNSPECIFIED' AFTER `currency`,
    ADD PRIMARY KEY (`bucket_hour`, `payer_fsp`, `payee_fsp`, `currency`, `sub_scenario`);

TRUNCATE TABLE `transaction_hourly_rollup`;

-- A deployment can briefly run old and new auditor pods together. The old scheduler may write
-- recent buckets after the truncate, so table emptiness alone is not a reliable backfill signal.
CREATE TABLE IF NOT EXISTS `transaction_rollup_state` (
    `state_key`         VARCHAR(64) NOT NULL,
    `backfill_required` BOOLEAN     NOT NULL DEFAULT TRUE,
    `updated_at`        DATETIME(6) NOT NULL,
    PRIMARY KEY (`state_key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

INSERT INTO `transaction_rollup_state` (`state_key`, `backfill_required`, `updated_at`)
VALUES ('dashboard', TRUE, NOW(6))
ON DUPLICATE KEY UPDATE `backfill_required` = TRUE, `updated_at` = NOW(6);
