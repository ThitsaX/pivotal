ALTER TABLE `transactions`
   ADD COLUMN `amount_type` VARCHAR(128) NULL AFTER `sub_scenario`;
