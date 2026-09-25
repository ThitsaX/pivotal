// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {RsaKeyPair} from '@shared/security';
import {VaultClient, VaultSettings} from '@shared/vault';
import {Pkcs11KeyGenerator} from '@shared/pkcs11';

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
 * Has the device generate the keypair, so the private half never exists outside it.
 *
 * The **HSM-backed** profile, and the reason this contract returns a public key alone.
 *
 * **Generated as the tenant's own crypto user.** The device confers ownership at creation and has
 * no transfer operation, so whoever generates a key can always use it — generating as a service
 * identity would hand that service the ability to sign as every tenant it ever onboarded. This
 * process therefore borrows the tenant's credential for the operation and holds none of its own.
 *
 * **It cannot create that crypto user.** The credential must already be in Vault, put there by a
 * custodian, because creating users needs a Crypto Officer and no service holds one. That is the
 * separation this profile exists to keep: this process can ask the device to make a key for a
 * tenant it has been given access to, and cannot invent a tenant.
 */
export class Pkcs11JwsKeyProvisioner extends JwsKeyProvisioner {

    private readonly logger = new Logger(Pkcs11JwsKeyProvisioner.name);

    constructor(
        private readonly keyGenerator: Pkcs11KeyGenerator,
        private readonly credentials: Pkcs11JwsKeyProvisioner.CredentialSource,
        private readonly vaultClient: VaultClient,
        /** Path prefix; the credential is read from `<prefix>/<fspId>`. */
        private readonly credentialPathPrefix: string,
        /** Path prefix; the reference is written to `<prefix>/<fspId>`. */
        private readonly keyRefPathPrefix: string,
        /** Crypto user that signs on tenants' behalf, named in the message about sharing. */
        private readonly sharedSigningUser: string,
    ) {
        super();
    }

    async provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned> {

        const tenant = fspId.trim();
        const credential = await this.credentials.credentialFor(
            `${this.credentialPathPrefix}/${tenant}`);

        // The label is the keyRef, and it must name exactly one key for the life of that key.
        // Minted fresh every time rather than derived from the tenant alone: rotation calls this
        // again, and a reused label would leave two keys answering to one reference.
        const label = Pkcs11JwsKeyProvisioner.mintLabel(tenant);

        const publicKeyPem = await this.keyGenerator.generate(credential, label);

        // Written before the caller records the public key, for the same reason the Vault
        // provisioner writes first: the other order can leave a tenant marked as signing with a
        // reference nothing can resolve. This order can at worst leave an unreferenced key in the
        // device, which fails nothing.
        await this.vaultClient.writeKvField(
            `${this.keyRefPathPrefix}/${tenant}`,
            Pkcs11JwsKeyProvisioner.KEY_REF_FIELD,
            label,
        );

        // Said loudly because nothing else will say it, and the failure it prevents is silent:
        // until the key is shared, the tenant's own connector signs fine while anything signing on
        // its behalf cannot -- which reads as a bug in the signing path rather than a missing step.
        this.logger.warn(
            `Provisioned '${tenant}' with key reference '${label}'. It is owned by that tenant's `
            + `crypto user and is NOT yet shared with '${this.sharedSigningUser}'. Sharing is a `
            + 'device operation with no PKCS#11 equivalent: run it from the device tooling before '
            + 'enabling signing, or anything signing on this tenant\'s behalf will fail.',
        );

        return new JwsKeyProvisioner.Provisioned(publicKeyPem);
    }

    private static readonly KEY_REF_FIELD = 'keyRef';

    /**
     * A label carrying the tenant and the moment it was minted.
     *
     * The timestamp is what makes it version-inclusive — two keys for one tenant never collide,
     * and the reference alone says which generation a signature came from.
     */
    private static mintLabel(fspId: string): string {
        return `${fspId}-jws-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;
    }
}

export namespace Pkcs11JwsKeyProvisioner {

    /** Reads a tenant's crypto-user credential. Implemented by the device bootstrap. */
    export interface CredentialSource {
        credentialFor(vaultPath: string): Promise<{username: string; password: string}>;
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
