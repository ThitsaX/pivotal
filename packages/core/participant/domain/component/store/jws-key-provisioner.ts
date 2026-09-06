// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {RsaKeyPair} from '@shared/security';
import {VaultClient, VaultSettings} from '@shared/vault';

/**
 * Creates the signing key for a tenant Pivotal signs as, wherever that deployment keeps keys.
 *
 * The mirror of {@link JwsPrivateKeySource}: that resolves a key, this brings one into existence.
 * Both are chosen from `KEY_PROVIDER`, so custody is decided once and reading and writing follow it
 * together rather than drifting apart.
 *
 * **Only a public key comes back.** Under the HSM profile there is no private key to return — it is
 * generated inside the hardware and cannot be exported, which is the whole point of that profile. A
 * contract that returned one would be unimplementable there, and would tempt callers into holding
 * material they must never see. Returning only the public half means the onboarding path handles no
 * private key under *any* profile, including the ones where a private key does exist.
 */
export abstract class JwsKeyProvisioner {

    /**
     * Brings a signing key into existence for `fspId` and returns its public half.
     *
     * Implementations must be safe to call again for a tenant that already has one: provisioning is
     * reached from onboarding, and an onboarding that is retried after a partial failure must not
     * leave a tenant with a key nobody recorded.
     */
    abstract provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned>;
}

export namespace JwsKeyProvisioner {

    export class Provisioned {
        constructor(
            readonly publicKeyPem: string,
            /**
             * Set **only** by the legacy database profile, whose custody is the database itself, so
             * the caller has to store what it was given. `vault-kv` leaves it undefined because the
             * key is already in Vault, and `pkcs11` because no private key exists outside the HSM.
             *
             * A caller that ignores this field is correct under both modern profiles. That is the
             * property worth preserving: the field exists to serve the path being retired, not to
             * invite new callers to handle key material.
             */
            readonly legacyPrivateKeyPem?: string,
        ) {
        }
    }
}

/**
 * Generates the keypair in this process and writes the private half to Vault KV.
 *
 * The **KMS-backed** profile. The key exists briefly in memory here, which is unavoidable when the
 * signing is also in-process; isolation comes from per-tenant Vault path policy rather than from a
 * hardware boundary.
 */
export class VaultJwsKeyProvisioner extends JwsKeyProvisioner {

    /** Must match what `VaultJwsPrivateKeySource` reads back. */
    private static readonly KEY_FIELD = 'privateKey';

    private readonly logger = new Logger(VaultJwsKeyProvisioner.name);

    constructor(
        private readonly vaultClient: VaultClient,
        private readonly settings: VaultSettings,
    ) {
        super();
    }

    async provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned> {

        const path = `${this.settings.jwsKeyPathPrefix}/${fspId}`;

        // Written before the caller records the public key. The other order can leave a tenant
        // marked as signing with no key to sign with, which fails at the first request; this order
        // can at worst leave an unreferenced key in Vault, which fails nothing.
        const keyPair = RsaKeyPair.generate();

        await this.vaultClient.writeKvField(
            path,
            VaultJwsKeyProvisioner.KEY_FIELD,
            keyPair.privateKey.toBuffer().toString('utf-8'),
        );

        this.logger.log(`Provisioned a signing key for '${fspId}' at Vault path '${path}'.`);

        return new JwsKeyProvisioner.Provisioned(
            keyPair.publicKey.toBuffer().toString('utf-8'),
        );
    }
}

/**
 * Has the HSM generate the keypair, so the private half never exists outside it.
 *
 * The **HSM-backed** profile, and the reason this seam returns a public key alone. Not implemented:
 * `KEY_PROVIDER=pkcs11` is declared and documented but has no signing implementation either, so a
 * deployment reaching this has chosen a profile that cannot sign yet.
 */
export class Pkcs11JwsKeyProvisioner extends JwsKeyProvisioner {

    async provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned> {

        // Throwing rather than falling back to a software key: a silent downgrade would put a
        // private key on a host in a deployment that chose hardware custody precisely to prevent
        // that, and nothing downstream would reveal the difference.
        throw new Error(
            `Cannot provision a signing key for '${fspId}': KEY_PROVIDER 'pkcs11' is not implemented.`,
        );
    }
}

/**
 * Generates the keypair and hands both halves back for storage in `participant_key`.
 *
 * **Legacy and development only**, matching `DatabaseJwsPrivateKeySource`. The private key ends up
 * in MySQL in plaintext, so this must not be used where real value moves.
 */
export class DatabaseJwsKeyProvisioner extends JwsKeyProvisioner {

    private readonly logger = new Logger(DatabaseJwsKeyProvisioner.name);

    async provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned> {

        const keyPair = RsaKeyPair.generate();

        this.logger.warn(
            `Provisioned a signing key for '${fspId}' for storage in MySQL. This is the legacy `
            + 'custody path; private keys are held in plaintext.',
        );

        return new JwsKeyProvisioner.Provisioned(
            keyPair.publicKey.toBuffer().toString('utf-8'),
            keyPair.privateKey.toBuffer().toString('utf-8'),
        );
    }
}
