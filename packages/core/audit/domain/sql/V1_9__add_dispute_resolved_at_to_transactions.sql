ALTER TABLE `transactions`
   ADD COLUMN `dispute_resolved_at` DATETIME(6) NULL AFTER `patch_error`;
