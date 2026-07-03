-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
CREATE TABLE IF NOT EXISTS `report_download_requests` (
    `id` BIGINT NOT NULL,
    `report_type` VARCHAR(64) NOT NULL,
    `params_signature` VARCHAR(128) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `file_type` VARCHAR(16) NOT NULL,
    `file_key` VARCHAR(1024),
    `error_message` TEXT,
    `requested_by_user_id` VARCHAR(128),
    `requested_by_fsp_id` VARCHAR(32),
    `finished_at` DATETIME(6),
    `created_at` DATETIME(6) NOT NULL,
    `updated_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `report_download_request_params` (
    `id` BIGINT NOT NULL,
    `request_id` BIGINT NOT NULL,
    `param_key` VARCHAR(128) NOT NULL,
    `param_value` TEXT,
    `created_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `report_download_request_params_01_fk`
        FOREIGN KEY (`request_id`) REFERENCES `report_download_requests` (`id`)
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX `report_download_requests_01_idx`
    ON `report_download_requests` (`status`, `created_at`);

CREATE INDEX `report_download_requests_02_idx`
    ON `report_download_requests` (`status`, `updated_at`);

CREATE INDEX `report_download_requests_03_idx`
    ON `report_download_requests` (`requested_by_fsp_id`, `created_at`);

CREATE INDEX `report_download_request_params_01_idx`
    ON `report_download_request_params` (`request_id`);
