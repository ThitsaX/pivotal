// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * How strictly web-inbound verifies the JWS signature on a request from a given source.
 *
 * Inbound verification cannot be a boolean, because the senders are peer DFSPs and the Hub, each
 * switching signing on to its own schedule. `Off` leaves a signing peer unverified; `Require`
 * rejects everyone who has not switched on yet — including the Hub, which today runs
 * `FSPIOP_USE_JWS=false` and so sends its errors unsigned.
 *
 * `VerifyIfPresent` is the state that is strict with signers and tolerant of non-signers at the
 * same time. It is also the rollback, and the source of the telemetry that says when `Require` is
 * safe for a given peer: the count of unsigned-but-accepted requests per source.
 *
 * The mode is resolved **per source**, not globally. A peer running with `jwsSignPutParties` off
 * signs everything except `PUT /parties`, so peers genuinely reach `Require` at different times.
 */
export enum FspiopVerifyMode {

    /** Signatures ignored entirely. */
    Off = 'off',

    /** A present signature must verify; a missing one is accepted and counted. */
    VerifyIfPresent = 'verify-if-present',

    /** A missing or invalid signature is rejected. */
    Require = 'require',
}

export namespace FspiopVerifyMode {

    const VALUES: readonly string[] = [
        FspiopVerifyMode.Off,
        FspiopVerifyMode.VerifyIfPresent,
        FspiopVerifyMode.Require,
    ];

    /**
     * Parses a configured or persisted value.
     *
     * An unrecognised value falls back to `fallback` rather than throwing: this is read on the
     * request path from data an operator can edit, and a typo must not take verification into an
     * undefined state. Callers that want to surface the typo should compare before and after.
     */
    export function parse(
        value: string | null | undefined,
        fallback: FspiopVerifyMode = FspiopVerifyMode.Off,
    ): FspiopVerifyMode {

        if (value == null) {
            return fallback;
        }

        const normalized = value.trim().toLowerCase();

        return VALUES.includes(normalized) ? normalized as FspiopVerifyMode : fallback;
    }

    export function isValid(value: string | null | undefined): boolean {
        return value != null && VALUES.includes(value.trim().toLowerCase());
    }
}
