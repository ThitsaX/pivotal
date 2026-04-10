CREATE TABLE IF NOT EXISTS `transactions` (
    `id` BIGINT NOT NULL,
    `correlation_id` VARCHAR(128) NOT NULL,
    `payer_fsp` VARCHAR(32) NOT NULL,
    `payee_fsp` VARCHAR(32) NOT NULL,
    `payer_id_type` VARCHAR(32),
    `payer_id` VARCHAR(128),
    `payer_sub_id` VARCHAR(128),
    `payee_id_type` VARCHAR(32),
    `payee_id` VARCHAR(128),
    `payee_sub_id` VARCHAR(128),
    `transaction_initiator_type` VARCHAR(32),
    `quoting_currency` VARCHAR(3),
    `quoting_amount` DECIMAL(34, 4),
    `transfer_currency` VARCHAR(3),
    `transfer_amount` DECIMAL(34, 4),
    `transaction_started_at` DATETIME(6) NOT NULL,
    `transaction_completed_at` DATETIME(6),
    `transaction_type` VARCHAR(32),
    `sub_scenario` VARCHAR(128),
    `transfer_state` VARCHAR(32),
    `possible_dispute` BOOLEAN NOT NULL DEFAULT FALSE,
    `error` BOOLEAN NOT NULL DEFAULT FALSE,
    `flow` INTEGER,
    `parties_requested_at` DATETIME(6),
    `parties_responded_at` DATETIME(6),
    `parties_request` JSON,
    `parties_response` JSON,
    `parties_error` JSON,
    `outbound_parties_requested_at` DATETIME(6),
    `outbound_parties_responded_at` DATETIME(6),
    `inbound_parties_requested_at` DATETIME(6),
    `inbound_parties_responded_at` DATETIME(6),
    `connector_parties_requested_at` DATETIME(6),
    `connector_parties_responded_at` DATETIME(6),
    `quotes_requested_at` DATETIME(6),
    `quotes_responded_at` DATETIME(6),
    `quotes_request` JSON,
    `quotes_response` JSON,
    `quotes_error` JSON,
    `outbound_quotes_requested_at` DATETIME(6),
    `outbound_quotes_responded_at` DATETIME(6),
    `inbound_quotes_requested_at` DATETIME(6),
    `inbound_quotes_responded_at` DATETIME(6),
    `connector_quotes_requested_at` DATETIME(6),
    `connector_quotes_responded_at` DATETIME(6),
    `transfers_requested_at` DATETIME(6),
    `transfers_responded_at` DATETIME(6),
    `transfers_request` JSON,
    `transfers_response` JSON,
    `transfers_error` JSON,
    `outbound_transfers_requested_at` DATETIME(6),
    `outbound_transfers_responded_at` DATETIME(6),
    `inbound_transfers_requested_at` DATETIME(6),
    `inbound_transfers_responded_at` DATETIME(6),
    `connector_transfers_requested_at` DATETIME(6),
    `connector_transfers_responded_at` DATETIME(6),
    `patch_requested_at` DATETIME(6),
    `patch_responded_at` DATETIME(6),
    `patch_request` JSON,
    `patch_error` TEXT,
    `created_at` DATETIME(6) NOT NULL,
    `updated_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX `transactions_01_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `transfer_state`, `transaction_started_at`);
CREATE INDEX `transactions_02_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `transfer_state`, `transaction_completed_at`);
CREATE INDEX `transactions_03_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `transaction_type`, `sub_scenario`, `quoting_currency`, `transaction_started_at`);
CREATE INDEX `transactions_04_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `transaction_type`, `sub_scenario`, `transfer_currency`, `transaction_started_at`);
CREATE INDEX `transactions_05_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `error`, `transaction_started_at`);
CREATE INDEX `transactions_06_idx` ON `transactions` (`created_at`);
CREATE INDEX `transactions_07_idx` ON `transactions` (`updated_at`);
CREATE UNIQUE INDEX `transactions_08_uk` ON `transactions` (`correlation_id`);
CREATE INDEX `transactions_09_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `outbound_parties_requested_at`);
CREATE INDEX `transactions_10_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `inbound_parties_requested_at`);
CREATE INDEX `transactions_11_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `outbound_quotes_requested_at`);
CREATE INDEX `transactions_12_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `inbound_quotes_requested_at`);
CREATE INDEX `transactions_13_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `outbound_transfers_requested_at`);
CREATE INDEX `transactions_14_idx` ON `transactions` (`payer_fsp`, `payee_fsp`, `inbound_transfers_requested_at`);
CREATE INDEX `transactions_15_idx` ON `transactions` (`payer_id_type`, `payer_id`, `payer_sub_id`, `transaction_started_at`);
CREATE INDEX `transactions_16_idx` ON `transactions` (`payee_id_type`, `payee_id`, `payee_sub_id`, `transaction_started_at`);
CREATE INDEX `transactions_17_idx` ON `transactions` (`possible_dispute`, `transaction_started_at`);
