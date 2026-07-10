// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
/**
 * DI token for the audit `MAX_LIMIT` value (the single system-wide cap on how many rows
 * the Find Transactions feature will count/return). Read once from the environment via
 * `WebPivotalSettings.auditMaxLimit()` and injected into the controller, so the core
 * package stays free of environment access.
 */
export const AUDIT_MAX_LIMIT = Symbol('AUDIT_MAX_LIMIT');
