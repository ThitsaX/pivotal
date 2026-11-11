// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Catalyst's current FX rate response in its original JSON representation.
 *
 * Keeping the body raw prevents JavaScript number conversion from changing a
 * plain decimal such as 0.0000000001 into scientific notation.
 */
export class RawCurrentFxRate {
    constructor(public readonly body: string) {
    }
}
