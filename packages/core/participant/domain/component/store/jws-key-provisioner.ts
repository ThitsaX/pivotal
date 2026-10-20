// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {createPublicKey} from 'node:crypto';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {RsaKeyPair} from '@shared/security';
import {VaultClient, VaultSettings} from '@shared/vault';
import {ParticipantErrorCode, participantError} from '../../error/participant-errors';

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
     * Refuses, before anything else is changed, when this tenant cannot be given a key.
     *
     * Onboarding calls this before it touches the ledger, so a tenant that will fail here is never
     * half-created there. Most profiles create the key themselves and have nothing to check.
     */
    async assertReady(fspId: string): Promise<void> {
        void fspId;
    }

    /**
     * Brings a signing key into existence for `fspId` and returns its public half, or null when
     * this deployment holds no Hub-facing signing keys at all.
     *
     * Implementations must be safe to call again for a tenant that already has one: provisioning is
     * reached from onboarding, and an onboarding that is retried after a partial failure must not
     * leave a tenant with a key nobody recorded.
     */
    abstract provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned | null>;
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
 * Records the key a custodian created in the HSM. Creates nothing.
 *
 * The **HSM-backed** profile. Creating the key needs the tenant's own crypto user, and sharing it
 * with the user that signs on tenants' behalf can only be done from the device tooling, so both
 * belong to the custodian's provisioning script. That script writes the key reference and the
 * public key to Vault; this reads them back.
 *
 * Keeping this side to a read is what lets this process hold no HSM credential and load no device
 * library: it cannot create, use or share any tenant's key, only learn the public half of one.
 */
export class Pkcs11JwsKeyProvisioner extends JwsKeyProvisioner {

    private static readonly KEY_REF_FIELD = 'keyRef';

    private static readonly PUBLIC_KEY_FIELD = 'publicKey';

    private readonly logger = new Logger(Pkcs11JwsKeyProvisioner.name);

    constructor(
        private readonly vaultClient: Pick<VaultClient, 'readKvField'>,
        /** Path prefix; the record is read from `<prefix>/<fspId>`. */
        private readonly keyRefPathPrefix: string,
    ) {
        super();
    }

    async assertReady(fspId: string): Promise<void> {
        await this.read(fspId);
    }

    async provision(fspId: string): Promise<JwsKeyProvisioner.Provisioned> {

        const record = await this.read(fspId);

        this.logger.log(
            `Recorded the HSM key '${record.keyRef}' that a custodian provisioned for '${fspId.trim()}'.`);

        return new JwsKeyProvisioner.Provisioned(record.publicKeyPem);
    }

    private async read(fspId: string): Promise<{keyRef: string; publicKeyPem: string}> {

        const path = `${this.keyRefPathPrefix}/${fspId.trim()}`;
        const keyRef = await this.vaultClient.readKvField(path, Pkcs11JwsKeyProvisioner.KEY_REF_FIELD);
        const publicKeyPem = await this.vaultClient.readKvField(
            path, Pkcs11JwsKeyProvisioner.PUBLIC_KEY_FIELD);

        if (keyRef == null || publicKeyPem == null) {
            this.logger.warn(
                `No key reference and public key at Vault path '${path}'. Provision '${fspId.trim()}' `
                + 'with the custodian script before onboarding it.');
            const error = participantError(ParticipantErrorCode.HSM_KEY_NOT_FOUND);
            throw new PivotalException(error.code, error.message);
        }

        try {
            createPublicKey(publicKeyPem);
        } catch {
            // A record the provisioning script did not write whole. Recording it would publish a key
            // to the Hub that no signature made with the HSM key could ever match.
            this.logger.warn(`The public key at Vault path '${path}' could not be read as a public key.`);
            const error = participantError(ParticipantErrorCode.HSM_KEY_RECORD_INVALID);
            throw new PivotalException(error.code, error.message);
        }

        return {keyRef, publicKeyPem};
    }
}

/**
 * Creates nothing: this deployment holds no Hub-facing signing keys.
 *
 * Selected when `KEY_PROVIDER` is unset or `none`. A tenant is onboarded without a key, so a
 * deployment that has not turned on JWS keeps no private keys it would never use.
 */
export class NoJwsKeyProvisioner extends JwsKeyProvisioner {

    async provision(fspId: string): Promise<null> {
        void fspId;
        return null;
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
