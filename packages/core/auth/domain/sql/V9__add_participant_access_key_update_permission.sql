-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 ThitsaWorks
INSERT INTO permissions (id, key_name, description, scope)
SELECT
    1126000000000000001,
    'participant.access-key.update',
    'Update the access public key used to verify a participant''s signed requests.',
    'HUB'
FROM (SELECT 1) AS existing_catalogue
WHERE NOT EXISTS (
    SELECT 1
    FROM permissions
    WHERE key_name = 'participant.access-key.update'
)
AND EXISTS (
    SELECT 1
    FROM roles
)
AND EXISTS (
    SELECT 1
    FROM permissions
);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key_name = 'participant.access-key.update'
WHERE roles.code = 'ADMIN';
