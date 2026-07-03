-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
ALTER TABLE `transactions`
    ADD COLUMN `payer_home_transaction_id` VARCHAR(128) NULL AFTER `patch_error`,
    ADD COLUMN `payee_home_transaction_id` VARCHAR(128) NULL AFTER `payer_home_transaction_id`;
