CREATE TABLE IF NOT EXISTS `refresh_tokens` (
    `id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `family_id` BIGINT NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `revoked_at` DATETIME NULL,
    `replaced_by` BIGINT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `refresh_tokens_01_uk_token_hash` (`token_hash`),
    KEY `refresh_tokens_02_idx_user_id` (`user_id`),
    KEY `refresh_tokens_03_idx_family_id` (`family_id`),
    CONSTRAINT `refresh_tokens_01_fk_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `refresh_tokens_02_fk_replaced_by` FOREIGN KEY (`replaced_by`) REFERENCES `refresh_tokens` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
