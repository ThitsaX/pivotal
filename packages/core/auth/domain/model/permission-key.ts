// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export const PermissionKey = {
    HUB_CURRENCY_ADD:                'hub.currency.add',
    HUB_SIGNING_KEYS_UPDATE:         'hub.signing-keys.update',
    PARTICIPANT_LIST:                'participant.list',
    PARTICIPANT_ONBOARD:             'participant.onboard',
    PARTICIPANT_CURRENCY_ADD:        'participant.currency.add',
    PARTICIPANT_ENDPOINT_REGISTER:   'participant.endpoint.register',
    PARTICIPANT_SIGNING_KEYS_UPDATE: 'participant.signing-keys.update',
    PARTICIPANT_ACCESS_KEY_UPDATE:   'participant.access-key.update',
    AUDIT_TRANSACTIONS_LIST:         'audit.transactions.list',
    AUDIT_TRANSACTIONS_VIEW:         'audit.transactions.view',
    AUDIT_DASHBOARD_VIEW:            'audit.dashboard.view',
    ADMIN_USERS_MANAGE:              'admin.users.manage',
    ADMIN_ROLES_MANAGE:              'admin.roles.manage',
    ADMIN_PERMISSIONS_LIST:          'admin.permissions.list',
} as const;

export type PermissionKeyValue = typeof PermissionKey[keyof typeof PermissionKey];

export const ALL_PERMISSION_KEYS: PermissionKeyValue[] = Object.values(PermissionKey);
