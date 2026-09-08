// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * A publication that will fail identically however often it is tried.
 *
 * Raised for the conditions no amount of waiting resolves: a tenant with no key of ours to publish,
 * or a key MCM already holds that disagrees with the one we hold. Both need someone to act — an
 * operator to finish onboarding, or a person to decide which key is current — and neither becomes
 * true on its own.
 *
 * The distinction exists because the consumer's two responses are opposite. A transient failure is
 * worth retrying, because MCM coming back is the expected end of it. A permanent one retried on a
 * delivery mechanism that redelivers immediately is a loop that runs until someone notices: one such
 * message, against a tenant MCM had never heard of, reached three hundred requests a second and ran
 * for a day.
 *
 * Terminating is safe rather than lossy. The hourly reconcile publishes any tenant MCM lacks a key
 * for, so dropping the announcement costs the tenant an hour, not its ability to sign — which is
 * exactly the division of labour between the event and the sweep.
 */
export class PermanentPublishError extends Error {

    constructor(message: string) {
        super(message);

        this.name = 'PermanentPublishError';

        Object.setPrototypeOf(this, new.target.prototype);
    }
}
