-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
CREATE TABLE IF NOT EXISTS `role_permissions` (
    `role_id` BIGINT NOT NULL,
    `permission_id` BIGINT NOT NULL,
    `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`role_id`, `permission_id`),
    KEY `role_permissions_01_idx_permission` (`permission_id`),
    CONSTRAINT `role_permissions_01_fk_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `role_permissions_02_fk_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
