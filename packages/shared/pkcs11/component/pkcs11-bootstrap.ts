// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {VaultClient} from '@shared/vault';
import {Pkcs11KeySigner} from './pkcs11-key-signer';
import {Pkcs11SessionPool} from './pkcs11-session-pool';
import {Pkcs11Settings} from './pkcs11-settings';

/**
 * Brings the device connection up at startup and takes it down on shutdown.
 *
 * **The credential is read from Vault here and nowhere else.** It is fetched once, used to log in,
 * and never consulted again — so Vault is not on the signing path, and an outage there cannot
 * become an outage in payments. It is also why the credential is not an environment variable: one
 * in the Deployment manifest shows up in `kubectl describe`, needs a redeploy to rotate, and leaves
 * no record of who read it. Read from Vault, every read is in Vault's audit log, which is the
 * signal a crypto-user credential is being used outside a provisioning window.
 *
 * Failing here stops the process. A deployment that chose hardware custody and cannot reach its
 * device should fail where that is visible, rather than start and refuse every payment.
 */
export class Pkcs11Bootstrap implements OnModuleInit, OnModuleDestroy {

    private static readonly USERNAME_FIELD = 'username';

    private static readonly PASSWORD_FIELD = 'password';

    private readonly logger = new Logger(Pkcs11Bootstrap.name);

    readonly pool: Pkcs11SessionPool;

    readonly keySigner: Pkcs11KeySigner;

    constructor(
        private readonly settings: Pkcs11Settings,
        private readonly vaultClient: VaultClient,
    ) {
        this.pool = new Pkcs11SessionPool(settings);
        this.keySigner = new Pkcs11KeySigner(this.pool);
    }

    async onModuleInit(): Promise<void> {

        const path = this.settings.credentialPath.trim();

        // No path configured means this workload has no crypto user of its own. That is the
        // provisioning shape: trust-manager deliberately holds no identity on the device, because
        // it generates each tenant's key as that tenant, and a standing identity of its own would
        // be one more thing able to sign.
        if (path.length === 0) {
            await this.pool.start();
            return;
        }

        const password = await this.vaultClient.readKvField(path, Pkcs11Bootstrap.PASSWORD_FIELD);

        if (password == null || password.length === 0) {
            throw new Error(
                `No crypto-user password at Vault path '${path}' field `
                + `'${Pkcs11Bootstrap.PASSWORD_FIELD}'. This workload cannot sign without it.`,
            );
        }

        // Absent on a device with no user model -- SoftHSM authenticates with a PIN alone. Stored
        // regardless so that moving to hardware changes the module path and nothing else, not the
        // shape of the secret and not the code that reads it.
        const username =
            await this.vaultClient.readKvField(path, Pkcs11Bootstrap.USERNAME_FIELD) ?? '';

        await this.pool.start({username, password});

        this.logger.log(
            `Signing through PKCS#11 as '${username.length > 0 ? username : '(pin only)'}', `
            + `credential from Vault path '${path}'.`,
        );
    }

    /** Reads one tenant's crypto-user credential, for an operation performed as that tenant. */
    async credentialFor(vaultPath: string): Promise<Pkcs11SessionPool.Credential> {

        const password = await this.vaultClient.readKvField(
            vaultPath, Pkcs11Bootstrap.PASSWORD_FIELD);

        if (password == null || password.length === 0) {
            throw new Error(
                `No crypto-user password at Vault path '${vaultPath}' field `
                + `'${Pkcs11Bootstrap.PASSWORD_FIELD}'. The crypto user is created by a custodian `
                + 'before onboarding; this reads it, and cannot create it.',
            );
        }

        const username =
            await this.vaultClient.readKvField(vaultPath, Pkcs11Bootstrap.USERNAME_FIELD) ?? '';

        return {username, password};
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.stop();
    }
}
