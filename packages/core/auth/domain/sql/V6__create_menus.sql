CREATE TABLE IF NOT EXISTS `menus` (
    `id` BIGINT NOT NULL,
    `menu_key` VARCHAR(64) NOT NULL,
    `parent_id` BIGINT NULL,
    `group_label` VARCHAR(64) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `icon` VARCHAR(64) NULL,
    `sort_order` INT NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `menus_01_uk_menu_key` (`menu_key`),
    KEY `menus_02_idx_parent` (`parent_id`),
    KEY `menus_03_idx_group_sort` (`group_label`, `sort_order`),
    CONSTRAINT `menus_01_fk_parent` FOREIGN KEY (`parent_id`) REFERENCES `menus` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
