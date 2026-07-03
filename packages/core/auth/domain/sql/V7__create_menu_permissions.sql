-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
CREATE TABLE IF NOT EXISTS `menu_permissions` (
    `menu_id` BIGINT NOT NULL,
    `permission_id` BIGINT NOT NULL,
    PRIMARY KEY (`menu_id`, `permission_id`),
    KEY `menu_permissions_01_idx_permission` (`permission_id`),
    CONSTRAINT `menu_permissions_01_fk_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`) ON DELETE CASCADE,
    CONSTRAINT `menu_permissions_02_fk_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
