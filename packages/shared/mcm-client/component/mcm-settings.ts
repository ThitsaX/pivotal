// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * Where MCM is and how to authenticate to it.
 *
 * Credentials are per Pivotal-fronted DFSP: MCM's native model names each Keycloak
 * client after the `dfspId` it serves. A single credential is enough for the
 * aggregate peer pull, which sits outside the `/dfsps/{dfspId}/` path; per-tenant
 * credentials are exercised only on onboarding and rotation.
 *
 * Avoid a `pta`-scoped credential as the baseline. It is the hub-operator role and
 * short-circuits authorization on every `/dfsps/{dfspId}` path, so it would let
 * Pivotal modify the registrations of DFSPs it does not front.
 */
export class McmSettings {

    constructor(
        readonly baseUrl: string,
        readonly tokenUrl: string,
        readonly clientId: string,
        readonly clientSecret: string,
        readonly socketTimeoutMs: number = 15_000,
        readonly connectionTimeoutMs: number = 10_000,
    ) {}

    isConfigured(): boolean {
        return this.baseUrl.trim().length > 0
            && this.tokenUrl.trim().length > 0
            && this.clientId.trim().length > 0;
    }
}
