// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export const ROLE_SCOPES = ['HUB', 'DFSP'] as const;

export type RoleScope = typeof ROLE_SCOPES[number];

export const PERMISSION_SCOPES = ['HUB', 'DFSP', 'BOTH'] as const;

export type PermissionScope = typeof PERMISSION_SCOPES[number];
