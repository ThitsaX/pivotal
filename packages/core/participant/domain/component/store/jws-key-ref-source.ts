// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {VaultClient, VaultSettings} from '@shared/vault';
import {ParticipantKey} from '../../model';
import {JwsPrivateKeySource} from './jws-private-key-source';

/**
 * Resolves the **key reference** each signing tenant uses, for profiles where no private key is
 * available to this process.
 *
 * The mirror of {@link JwsPrivateKeySource}, and deliberately a separate type rather than the same
 * one returning different content. Both would be `Map<string, string>`, and the two strings mean
 * opposite things: one is key material to sign with, the other names a key the process can never
 * hold. Keeping them distinct is what stops a key reference reaching a function that expects a PEM,
 * which would not fail to compile and would fail at the first signature.
 */
export abstract class JwsKeyRefSource {

    /**
     * @param participantKeys every row, so the implementation can decide which ones it needs
     * @param previous the last successfully resolved map, so a transient failure carries forward
     * @returns fspId → key reference, for tenants that are keyed **and** switched on
     */
    abstract resolve(
        participantKeys: ParticipantKey[],
        previous: ReadonlyMap<string, string>,
    ): Promise<Map<string, string>>;
}

/**
 * Reads each signing tenant's key reference from its own Vault KV path.
 *
 * Read at startup and on refresh, never on the signing path: a reference is looked up once and
 * cached, so an outage in Vault cannot become an outage in payments. The reference is opaque here —
 * it is the key's PKCS#11 label, and only the device layer gives it meaning.
 */
export class VaultJwsKeyRefSource extends JwsKeyRefSource {

    /** Must match what the provisioning runbook writes. */
    private static readonly KEY_REF_FIELD = 'keyRef';

    private readonly logger = new Logger(VaultJwsKeyRefSource.name);

    constructor(
        private readonly vaultClient: VaultClient,
        private readonly settings: VaultSettings,
        /** Path prefix; a tenant's reference is read from `<prefix>/<fspId>`. */
        private readonly keyRefPathPrefix: string = 'pivotal/keyref',
    ) {
        super();
    }

    async resolve(
        participantKeys: ParticipantKey[],
        previous: ReadonlyMap<string, string>,
    ): Promise<Map<string, string>> {

        const keyRefs = new Map<string, string>();

        for (const participantKey of participantKeys) {

            if (!JwsPrivateKeySource.isSigningTenant(participantKey)) {
                continue;
            }

            const fspId = participantKey.fspId.trim();
            const path = `${this.keyRefPathPrefix}/${fspId}`;

            try {
                const keyRef = await this.vaultClient.readKvField(
                    path,
                    VaultJwsKeyRefSource.KEY_REF_FIELD,
                );

                if (keyRef == null || keyRef.trim().length === 0) {
                    // Switched on but never provisioned in the device. Loud, because someone
                    // believes this tenant is signing and it is not.
                    this.logger.error(
                        `Tenant '${fspId}' has jws_sign_enabled but no key reference at Vault path `
                        + `'${path}' field '${VaultJwsKeyRefSource.KEY_REF_FIELD}'. It will not sign.`,
                    );
                    continue;
                }

                keyRefs.set(fspId, keyRef.trim());

            } catch (error) {
                // Carry the previous reference forward. A Vault blip must not stop a tenant
                // signing: the key has not moved, only our ability to re-read its name.
                const carried = previous.get(fspId);

                this.logger.error(
                    `Failed to read the key reference for '${fspId}' from Vault path '${path}': `
                    + `${(error as Error).message}. `
                    + (carried != null ? 'Carrying the previously loaded reference forward.'
                        : 'No previously loaded reference to fall back on; this tenant will not sign.'),
                );

                if (carried != null) {
                    keyRefs.set(fspId, carried);
                }
            }
        }

        return keyRefs;
    }
}
