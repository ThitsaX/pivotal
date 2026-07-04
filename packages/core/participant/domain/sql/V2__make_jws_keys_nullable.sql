ALTER TABLE `participant`
    MODIFY COLUMN `jws_public_key` TEXT NULL,
    MODIFY COLUMN `jws_private_key` TEXT NULL;
