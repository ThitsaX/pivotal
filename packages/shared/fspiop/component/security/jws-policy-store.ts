// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { FspiopVerifyMode } from '../fspiop-verify-mode';

/**
 * Per-participant JWS policy: whether Pivotal signs as a given tenant, and how strictly it
 * verifies what a given source sends.
 *
 * Deliberately separate from {@link PrivateKeyStore} and {@link PublicKeyStore}. Holding a key and
 * being switched on are different facts — a tenant is given a key well before its peers are ready
 * to verify, and a peer's key is registered well before Pivotal starts rejecting its unsigned
 * traffic. Conflating them would make the rollout a redeploy rather than a data change.
 *
 * Mirrors the key-store pattern: an abstract class so consumers depend on the shape, with the
 * database-backed implementation living in the participant domain and a static one here for
 * services that have no database.
 */
export abstract class JwsPolicyStore {

    abstract load(): JwsPolicyStore;

    /** Whether outbound requests carrying this `fspiop-source` should be signed. */
    abstract signEnabled(fspId: string): boolean;

    /** How strictly to verify inbound requests carrying this `fspiop-source`. */
    abstract verifyMode(fspId: string): FspiopVerifyMode;
}

/**
 * Policy for deployments with no participant database — the sample connectors, and any service
 * where a single global setting is the whole story.
 */
export class StaticJwsPolicyStore extends JwsPolicyStore {

    constructor(
        private readonly signingEnabled: boolean,
        private readonly mode: FspiopVerifyMode,
    ) {
        super();
    }

    load(): JwsPolicyStore {
        return this;
    }

    signEnabled(fspId: string): boolean {
        void fspId;
        return this.signingEnabled;
    }

    verifyMode(fspId: string): FspiopVerifyMode {
        void fspId;
        return this.mode;
    }
}
