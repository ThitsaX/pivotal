CREATE TABLE IF NOT EXISTS `participant` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `jws_public_key` TEXT NOT NULL,
    `jws_private_key` TEXT NOT NULL,
    `access_public_key` TEXT NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `participant_01_uk` (`name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
