-- Preserve existing IDs; new audit writes supply only the unique correlation_id.
-- MySQL starts the generated sequence above the largest existing ID.
ALTER TABLE `transactions`
    MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT;
