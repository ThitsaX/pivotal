DELETE FROM `menus`
WHERE `menu_key` = 'admin-menus';

DELETE FROM `permissions`
WHERE `key_name` = 'admin.menus.manage';
