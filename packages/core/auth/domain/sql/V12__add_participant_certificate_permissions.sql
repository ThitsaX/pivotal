-- Backfill the DFSP client-certificate permissions, their ADMIN grants, and the menu entry, on
-- EXISTING installs.
--
-- Why a migration is needed: `RbacSeeder` seeds only when the `permissions` table is empty
-- (`count() > 0` -> skip). A database provisioned before these permissions existed never receives
-- them from the seeder, so the certificate screens would 403 for everyone including the
-- administrator.
--
-- Why this no-ops on a FRESH database: migrations run before the seeders (web-pivotal main.ts). On
-- a fresh install the tables are empty at migration time, the `total > 0` guards yield no rows, and
-- the seeder then inserts everything as usual.
--
-- Idempotent: `key_name` and `menu_key` are unique, the `already = 0` guards stop a second insert,
-- and the join tables use INSERT IGNORE.

-- Enrolling, viewing and revoking are separated because they are different decisions. Revoking cuts
-- a DFSP off mid-operation; issuing one does not.
INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'participant.certificate.enroll',
       'Sign a participant''s certificate request and issue a client certificate.',
       'HUB'
FROM (
    SELECT MAX(`id`) + 1                                          AS next_id,
           COUNT(*)                                               AS total,
           SUM(`key_name` = 'participant.certificate.enroll')      AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'participant.certificate.view',
       'View and download participant client certificates and their status.',
       'HUB'
FROM (
    SELECT MAX(`id`) + 1                                          AS next_id,
           COUNT(*)                                               AS total,
           SUM(`key_name` = 'participant.certificate.view')        AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'participant.certificate.revoke',
       'Revoke a participant client certificate before it expires.',
       'HUB'
FROM (
    SELECT MAX(`id`) + 1                                          AS next_id,
           COUNT(*)                                               AS total,
           SUM(`key_name` = 'participant.certificate.revoke')      AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

-- ADMIN only. These are HUB-scoped: enrollment is operator-mediated, so no DFSP-scoped role
-- receives them.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p
  ON p.`key_name` IN ('participant.certificate.enroll',
                      'participant.certificate.view',
                      'participant.certificate.revoke')
WHERE r.`code` = 'ADMIN';

-- The screen itself, gated on the view permission: an operator who cannot read a certificate has
-- no use for the menu entry.
INSERT INTO `menus` (`id`, `menu_key`, `parent_id`, `group_label`, `label`, `route`, `sort_order`)
SELECT src.next_id,
       'participant-certificates',
       NULL,
       'Participant',
       'Certificates',
       '/views/participant-certificates',
       50
FROM (
    SELECT MAX(`id`) + 1                                     AS next_id,
           COUNT(*)                                          AS total,
           SUM(`menu_key` = 'participant-certificates')       AS already
    FROM `menus`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT IGNORE INTO `menu_permissions` (`menu_id`, `permission_id`)
SELECT m.`id`, p.`id`
FROM `menus` m
JOIN `permissions` p ON p.`key_name` = 'participant.certificate.view'
WHERE m.`menu_key` = 'participant-certificates';
