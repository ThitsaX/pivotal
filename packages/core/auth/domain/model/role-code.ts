// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export const ADMIN_ROLE_CODE = 'ADMIN';
export const DFSP_USER_ROLE_CODE = 'DFSP_USER';

export const SYSTEM_ROLE_CODES = [ADMIN_ROLE_CODE, DFSP_USER_ROLE_CODE] as const;
export type SystemRoleCode = typeof SYSTEM_ROLE_CODES[number];
