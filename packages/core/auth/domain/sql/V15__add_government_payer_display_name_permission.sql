-- Backfill the government payer display-name permission and its ADMIN grant on EXISTING installs.
--
-- `RbacSeeder` seeds only when the `permissions` table is empty. A database provisioned before this
-- permission existed never receives it from the seeder, so the API would 403 for everyone including
-- the administrator.
--
-- Migrations run before the seeders. On a fresh install the tables are empty here, the `total > 0`
-- guard yields no row, and the seeder inserts the permission with the rest of the catalogue.
--
-- No menu row: there is no portal screen for this yet. The API is the operator interface.
-- Idempotent: `key_name` is unique, the `already = 0` guard stops a second insert, and the grant
-- uses INSERT IGNORE.

INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'participant.payer-display-name.update',
       'View and set the payer display name used on government-to-person transfers when the sender leaves it blank.',
       'HUB'
FROM (
    SELECT MAX(`id`) + 1                                              AS next_id,
           COUNT(*)                                                   AS total,
           SUM(`key_name` = 'participant.payer-display-name.update')  AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key_name` = 'participant.payer-display-name.update'
WHERE r.`code` = 'ADMIN';
