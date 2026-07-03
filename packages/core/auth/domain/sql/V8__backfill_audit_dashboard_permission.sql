-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
-- Backfill the `audit.dashboard.view` permission and its role grants on EXISTING installs.
--
-- Why a migration is needed: `RbacSeeder` only seeds when the `permissions` table is
-- empty (`count() > 0` -> skip). A DB provisioned before this permission existed will
-- therefore never receive it from the seeder, so the dashboard 403s for everyone.
--
-- Why this no-ops on a FRESH DB: migrations run BEFORE the seeders (see web-pivotal
-- main.ts). On a fresh install the `permissions` table is empty at migration time;
-- the guards below (`src.total > 0`, and the grant JOIN finding the permission row)
-- yield zero rows, so this migration does nothing and the seeder then inserts the
-- permission + grants as usual. On an existing install the table is populated, so the
-- permission is inserted here and granted to the ADMIN and DFSP_USER roles.
--
-- Idempotent: re-running inserts nothing (key_name is unique; grants use INSERT IGNORE).
-- IDs are app-assigned BIGINTs (Snowflake-style); MAX(id)+1 cannot collide with an
-- existing row, and future app-generated IDs are time-based and far larger.

INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'audit.dashboard.view',
       'View the transaction statistics dashboard.',
       'BOTH'
FROM (
    SELECT MAX(`id`) + 1                                  AS next_id,
           COUNT(*)                                       AS total,
           SUM(`key_name` = 'audit.dashboard.view')       AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key_name` = 'audit.dashboard.view'
WHERE r.`code` IN ('ADMIN', 'DFSP_USER');
