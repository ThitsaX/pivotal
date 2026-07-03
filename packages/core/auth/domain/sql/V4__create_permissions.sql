-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
CREATE TABLE IF NOT EXISTS `permissions` (
    `id` BIGINT NOT NULL,
    `key_name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `scope` VARCHAR(8) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `permissions_01_uk_key_name` (`key_name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
