ALTER TABLE `transactions`
   ADD COLUMN `dispute_resolved_at` DATETIME(3) NULL AFTER `patch_error`;
