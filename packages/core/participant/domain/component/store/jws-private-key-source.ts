// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {VaultClient, VaultSettings} from '@shared/vault';
import {ParticipantKey, ParticipantKeyRole} from '../../model';

/**
 * Resolves JWS **private** keys for the tenants Pivotal signs as.
 *
 * Split from the registry deliberately. `participant_key` answers *who exists and what is switched
 * on* — that is public, queryable, and belongs in MySQL. This answers *what the key is*, which under
 * either deployment profile lives in Vault. One store per value (settled decision 17).
 *
 * Public keys are not routed through here: they are not secret, so they stay on `participant_key`
 * where the inbound guard can read them without a Vault round trip.
 */
export abstract class JwsPrivateKeySource {

    /**
     * @param participantKeys every row, so the implementation can decide which ones it needs
     * @param previous the last successfully resolved map, so a transient failure carries forward
     *     rather than silently disabling signing for a tenant
     * @returns fspId → private key PEM, for tenants that are keyed **and** switched on
     */
    abstract resolve(
        participantKeys: ParticipantKey[],
        previous: ReadonlyMap<string, string>,
    ): Promise<Map<string, string>>;
}

/**
 * Reads private keys straight from `participant_key`.
 *
 * **Legacy and development only** — the interim state recorded as S1, which let the signing contract
 * land before Vault existed. Keys sit in the database in plaintext; do not use where real value
 * moves.
 */
export class DatabaseJwsPrivateKeySource extends JwsPrivateKeySource {

    async resolve(
        participantKeys: ParticipantKey[],
        // Unused: the database read cannot fail partway in a way that would need a fallback.
        previous?: ReadonlyMap<string, string>,
    ): Promise<Map<string, string>> {

        void previous;

        const keys = new Map<string, string>();

        for (const participantKey of participantKeys) {

            if (!JwsPrivateKeySource.isSigningTenant(participantKey)) {
                continue;
            }

            const pem = JwsPrivateKeySource.normalizePem(participantKey.jwsPrivateKey);

            if (pem != null) {
                keys.set(participantKey.fspId.trim(), pem);
            }
        }

        return keys;
    }
}

/**
 * Reads each signing tenant's private key from its own Vault KV path.
 *
 * web-outbound signs as whichever tenant is the payer, so unlike a connector it must read **every**
 * tenant's key — which is where the blast radius of this component sits (`architecture.md` §4.8).
 * The per-tenant path model is unchanged; only the number of paths read differs.
 */
export class VaultJwsPrivateKeySource extends JwsPrivateKeySource {

    private static readonly KEY_FIELD = 'privateKey';

    private readonly logger = new Logger(VaultJwsPrivateKeySource.name);

    constructor(
        private readonly vaultClient: VaultClient,
        private readonly settings: VaultSettings,
    ) {
        super();
    }

    async resolve(
        participantKeys: ParticipantKey[],
        previous: ReadonlyMap<string, string>,
    ): Promise<Map<string, string>> {

        const keys = new Map<string, string>();

        for (const participantKey of participantKeys) {

            if (!JwsPrivateKeySource.isSigningTenant(participantKey)) {
                continue;
            }

            const fspId = participantKey.fspId.trim();
            const path = `${this.settings.jwsKeyPathPrefix}/${fspId}`;

            try {
                const pem = await this.vaultClient.readKvField(path, VaultJwsPrivateKeySource.KEY_FIELD);

                if (pem == null) {
                    // Switched on but never provisioned. Loud, because someone believes this tenant
                    // is signing and it is not.
                    this.logger.error(
                        `Tenant '${fspId}' has jws_sign_enabled but no key at Vault path '${path}' `
                        + `field '${VaultJwsPrivateKeySource.KEY_FIELD}'. It will not sign.`,
                    );
                    continue;
                }

                const normalized = JwsPrivateKeySource.normalizePem(pem);

                if (normalized != null) {
                    keys.set(fspId, normalized);
                }

            } catch (error) {
                // Carry the previous key forward. A Vault blip must not silently stop a tenant
                // signing — the key has not changed, only our ability to re-read it.
                const carried = previous.get(fspId);

                this.logger.error(
                    `Failed to read the JWS key for '${fspId}' from Vault path '${path}': `
                    + `${(error as Error).message}. `
                    + (carried != null ? 'Carrying the previously loaded key forward.'
                        : 'No previously loaded key to fall back on; this tenant will not sign.'),
                );

                // Force re-authentication: an expired token is the likeliest cause.
                this.vaultClient.invalidateToken();

                if (carried != null) {
                    keys.set(fspId, carried);
                }
            }
        }

        return keys;
    }
}

export namespace JwsPrivateKeySource {

    /**
     * A tenant signs only when Pivotal holds its key **and** an operator has switched it on. Two
     * separate facts: keys are provisioned well before peers are ready to verify.
     */
    export function isSigningTenant(participantKey: ParticipantKey): boolean {

        return participantKey.role === ParticipantKeyRole.Self
            && participantKey.jwsSignEnabled === true
            && participantKey.fspId.trim().length > 0;
    }

    export function normalizePem(pem: string | null | undefined): string | undefined {

        if (pem == null || pem.trim().length === 0) {
            return undefined;
        }

        return pem.replace(/\\n/g, '\n');
    }
}
