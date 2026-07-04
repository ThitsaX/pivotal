// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {PermissionKey} from '../model/permission-key';
import {RoleScope} from '../model/role-scope';

export interface RolePreset {
    key:            string;
    label:          string;
    description:    string;
    scope:          RoleScope;
    permissionKeys: string[];
}

export const ROLE_PRESETS: readonly RolePreset[] = [
    {
        key:         'full-admin',
        label:       'Full Admin',
        description: 'Every hub-side permission, plus audit. Equivalent to the seeded ADMIN role.',
        scope:       'HUB',
        permissionKeys: [
            PermissionKey.HUB_CURRENCY_ADD,
            PermissionKey.HUB_SIGNING_KEYS_UPDATE,
            PermissionKey.PARTICIPANT_LIST,
            PermissionKey.PARTICIPANT_ONBOARD,
            PermissionKey.PARTICIPANT_CURRENCY_ADD,
            PermissionKey.PARTICIPANT_ENDPOINT_REGISTER,
            PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE,
            PermissionKey.PARTICIPANT_ACCESS_KEY_UPDATE,
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
            PermissionKey.AUDIT_TRANSACTIONS_VIEW,
            PermissionKey.ADMIN_USERS_MANAGE,
            PermissionKey.ADMIN_ROLES_MANAGE,
            PermissionKey.ADMIN_PERMISSIONS_LIST,
            PermissionKey.ADMIN_MENUS_MANAGE,
        ],
    },
    {
        key:         'hub-onboarder',
        label:       'Hub Onboarder',
        description: 'Onboard new FSPs and manage their endpoints, currencies, and signing keys. No admin or hub-currency rights.',
        scope:       'HUB',
        permissionKeys: [
            PermissionKey.PARTICIPANT_LIST,
            PermissionKey.PARTICIPANT_ONBOARD,
            PermissionKey.PARTICIPANT_CURRENCY_ADD,
            PermissionKey.PARTICIPANT_ENDPOINT_REGISTER,
            PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE,
            PermissionKey.PARTICIPANT_ACCESS_KEY_UPDATE,
        ],
    },
    {
        key:         'hub-settlement-currency',
        label:       'Hub Settlement & Currency',
        description: 'Add hub-level settlement currencies and manage participant currency + signing-key configuration.',
        scope:       'HUB',
        permissionKeys: [
            PermissionKey.HUB_CURRENCY_ADD,
            PermissionKey.HUB_SIGNING_KEYS_UPDATE,
            PermissionKey.PARTICIPANT_LIST,
            PermissionKey.PARTICIPANT_CURRENCY_ADD,
            PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE,
        ],
    },
    {
        key:         'hub-compliance-audit',
        label:       'Hub Compliance / Audit',
        description: 'Read-only audit visibility across all FSPs. No write rights.',
        scope:       'HUB',
        permissionKeys: [
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
            PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        ],
    },
    {
        key:         'dfsp-operator',
        label:       'DFSP Operator',
        description: 'Audit visibility scoped to a single FSP. Equivalent to the seeded DFSP_USER role.',
        scope:       'DFSP',
        permissionKeys: [
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
            PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        ],
    },
    {
        key:         'user-role-manager',
        label:       'User & Role Manager',
        description: 'Manage portal users, roles, and the permission catalogue. No hub-operations or audit rights.',
        scope:       'HUB',
        permissionKeys: [
            PermissionKey.ADMIN_USERS_MANAGE,
            PermissionKey.ADMIN_ROLES_MANAGE,
            PermissionKey.ADMIN_PERMISSIONS_LIST,
        ],
    },
];
