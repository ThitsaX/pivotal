-- Add scoped DFSP user administration on EXISTING installs.
--
-- Fresh installs have empty RBAC tables when migrations run, so these inserts no-op and
-- RbacSeeder creates the full catalogue afterward. Existing installs receive the new
-- permission, DFSP_ADMIN system role, grants, and Users menu permission link.

INSERT INTO `permissions` (`id`, `key_name`, `description`, `scope`)
SELECT src.next_id,
       'admin.dfsp-users.manage',
       'Manage portal user accounts within the same FSP.',
       'DFSP'
FROM (
    SELECT MAX(`id`) + 1 AS next_id,
           COUNT(*) AS total,
           SUM(`key_name` = 'admin.dfsp-users.manage') AS already
    FROM `permissions`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT INTO `roles` (`id`, `code`, `name`, `description`, `scope`, `is_system`)
SELECT src.next_id,
       'DFSP_ADMIN',
       'DFSP Administrator',
       'Administrator scoped to manage users within a single FSP.',
       'DFSP',
       TRUE
FROM (
    SELECT MAX(`id`) + 1 AS next_id,
           COUNT(*) AS total,
           SUM(`code` = 'DFSP_ADMIN') AS already
    FROM `roles`
) AS src
WHERE src.total > 0
  AND src.already = 0;

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key_name` IN (
    'audit.transactions.list',
    'audit.transactions.view',
    'audit.dashboard.view',
    'admin.dfsp-users.manage'
)
WHERE r.`code` = 'DFSP_ADMIN';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`key_name` = 'admin.dfsp-users.manage'
WHERE r.`code` = 'ADMIN';

INSERT IGNORE INTO `menu_permissions` (`menu_id`, `permission_id`)
SELECT m.`id`, p.`id`
FROM `menus` m
JOIN `permissions` p ON p.`key_name` = 'admin.dfsp-users.manage'
WHERE m.`menu_key` = 'admin-users';