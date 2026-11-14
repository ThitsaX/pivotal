// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * The government payer display name configured for a DFSP.
 *
 * The outbound domain does not read the participant table. The application
 * supplies this from the cache it already keeps.
 */
export abstract class GovernmentPayerDisplayNameStore {

    abstract get(fspId: string): string | undefined;
}
