// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

export type JwsVerifyMode = 'off' | 'verify-if-present' | 'require';

/** What `GET /participant/jws-policy` returns. */
export interface JwsPolicy {
    fspId:          string;
    role:           'self' | 'peer' | string;
    hasPublicKey:   boolean;
    jwsSignEnabled: boolean;
    jwsVerifyMode:  JwsVerifyMode;
}

export interface JwsPolicyForm {
    jwsSignEnabled: boolean;
    jwsVerifyMode:  JwsVerifyMode;
}

export interface JwsPolicyUpdate {
    fspId:           string;
    jwsSignEnabled?: boolean;
    jwsVerifyMode?:  JwsVerifyMode;
}

/**
 * The request body for the switches the operator actually moved, or null when nothing moved.
 *
 * Each switch is sent only when it differs from what was loaded. Sending an untouched switch would
 * write back whatever the form happened to hold, which is how changing only the verify mode used
 * to turn signing off.
 */
export function jwsPolicyChanges(current: JwsPolicy, form: JwsPolicyForm): JwsPolicyUpdate | null {

    const update: JwsPolicyUpdate = {fspId: current.fspId};

    if (form.jwsSignEnabled !== current.jwsSignEnabled) {
        update.jwsSignEnabled = form.jwsSignEnabled;
    }

    if (form.jwsVerifyMode !== current.jwsVerifyMode) {
        update.jwsVerifyMode = form.jwsVerifyMode;
    }

    return update.jwsSignEnabled === undefined && update.jwsVerifyMode === undefined ? null : update;
}

/** Signing can be switched on only for a tenant Pivotal signs for that has a key on record. */
export function canEnableSigning(current: JwsPolicy): boolean {
    return current.role === 'self' && current.hasPublicKey;
}
