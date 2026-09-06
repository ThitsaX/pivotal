// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Announces that a tenant has been given a signing key and needs its public half published.
 *
 * Carries the identifier and nothing else. The public key is deliberately absent: trust-manager
 * reads it from `participant_key` when it handles the message, so the registry stays the one place
 * that answers what a tenant's key is. Putting the key in the message would create a second copy
 * that can disagree with the first — and the one in the message would be the stale one, since a
 * rotation writes the row and emits a new event rather than editing an event already sent.
 */
export class SigningTenantProvisionedMessage {

    constructor(readonly fspId: string) {
    }
}
