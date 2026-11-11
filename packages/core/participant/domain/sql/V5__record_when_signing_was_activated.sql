-- Separates "signing was never switched on" from "signing was switched on and later suspended".
--
-- The hourly key-publish sweep needs to tell those two apart. It registers a tenant's public key
-- with the Connection Manager and, until now, stopped there: a tenant that missed the provisioning
-- announcement had its key published with `jws_sign_enabled` left at 0, and every later sweep found
-- the key already registered, counted it correct and moved on. That tenant never signed again.
--
-- Letting the sweep switch signing on is only safe if it can recognise a tenant an operator
-- deliberately suspended, and `jws_sign_enabled` alone cannot say which of the two a 0 means. This
-- column records the first activation and is never cleared by a suspension, so NULL means "never
-- activated" — and only that case is the sweep's to act on.

ALTER TABLE `participant_key`
    ADD COLUMN `jws_sign_activated_at` DATETIME NULL DEFAULT NULL AFTER `jws_sign_enabled`;

-- Tenants already signing have plainly been activated. Leaving them NULL would hand the sweep the
-- authority to re-enable them after some future suspension, which is the behaviour this column
-- exists to prevent; `updated_at` is the closest record of when the switch was thrown.
UPDATE `participant_key`
SET `jws_sign_activated_at` = `updated_at`
WHERE `jws_sign_enabled` = 1
  AND `jws_sign_activated_at` IS NULL;
