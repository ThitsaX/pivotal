ALTER TABLE `transactions`
    ADD COLUMN `payee_receive_amount` DECIMAL(34, 4) NULL AFTER `transfer_amount`,
    ADD COLUMN `payee_fee` DECIMAL(34, 4) NULL AFTER `payee_receive_amount`,
    ADD COLUMN `payer_fee` DECIMAL(34, 4) NULL AFTER `payee_fee`,
    ADD COLUMN `scheme_fee` DECIMAL(34, 4) NULL AFTER `payer_fee`;
