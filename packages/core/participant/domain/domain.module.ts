// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {CentralLedgerAxios, CentralLedgerAxiosParams, CentralLedgerFacade} from '@shared/central-ledger';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {KeyProvider, VaultClient, VaultSettings} from '@shared/vault';
import {JwsSigner, PrivateKeyJwsSigner} from '@shared/fspiop';
import {Pkcs11Bootstrap, Pkcs11JwsSigner, Pkcs11KeyGenerator, Pkcs11Settings} from '@shared/pkcs11';
import {
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    EnrollDfspCertificateHandler,
    OnboardFspHandler,
    RevokeDfspCertificateHandler,
    UpdateAccessKeyHandler,
    UpdateJwsPolicyHandler,
    UpsertEndpointHandler,
} from './command';
import {Participant, ParticipantCert, ParticipantCertStatus, ParticipantKey} from './model';
import {
    GetDfspCertificateHandler,
    ListCentralLedgerParticipantsHandler,
    ListDfspCertificatesHandler,
} from './query';
import {
    ParticipantCertRepository,
    ParticipantKeyRepository,
    ParticipantRepository,
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
} from './repository';
import {ParticipantSigningKeysCache} from "@core/participant/domain/component/store/participant-signing-keys-cache";
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {SigningTenantPublisher} from './component/signing-tenant.publisher';
import {
    DatabaseJwsPrivateKeySource,
    DeviceHeldJwsPrivateKeySource,
    JwsPrivateKeySource,
    VaultJwsPrivateKeySource,
} from './component/store/jws-private-key-source';
import {JwsKeyRefSource, VaultJwsKeyRefSource} from './component/store/jws-key-ref-source';
import {ParticipantKeyRefStore} from './component/store/participant-key-ref-store';
import {ParticipantJwsPrivateKeyStore} from './component/store/participant-jws-private-key-store';
import {
    DatabaseJwsKeyProvisioner,
    JwsKeyProvisioner,
    Pkcs11JwsKeyProvisioner,
    VaultJwsKeyProvisioner,
} from './component/store/jws-key-provisioner';
import {DfspCertificateIssuer} from './component/cert';

const REQUIRED_SETTINGS = Symbol('ParticipantDomainRequiredSettings');

const Entities = [
    Participant,
    ParticipantKey,
    ParticipantCert,
    ParticipantCertStatus,
];

const Repositories = [
    ParticipantRepository,
    ParticipantKeyRepository,
    ParticipantCertRepository,
];

const Components: Provider[] = [
    {
        provide: JwsPrivateKeySource,
        useFactory: (settings: ParticipantDomainModule.RequiredSettings): JwsPrivateKeySource =>
            ParticipantDomainModule.createPrivateKeySource(settings),
        inject: [REQUIRED_SETTINGS],
    },
    {
        // Announces a provisioned tenant so its key reaches MCM promptly. Null without a NATS
        // connection: the announcement is an optimisation over trust-manager's reconcile, so its
        // absence delays publication rather than preventing it.
        provide: SigningTenantPublisher,
        // Connectivity is NOT decided here. A provider factory runs while dependencies are being
        // constructed, which is before NatsClientService's onModuleInit has connected -- so a check
        // at this point always sees a disconnected client and silently yields no publisher. The
        // publisher takes the client and asks at publish time instead.
        useFactory: (nats: NatsClientService | undefined): SigningTenantPublisher | null =>
            nats == null ? null : new SigningTenantPublisher(nats),
        inject: [{token: NatsClientService, optional: true}],
    },
    {
        provide: JwsKeyProvisioner,
        useFactory: (settings: ParticipantDomainModule.RequiredSettings): JwsKeyProvisioner =>
            ParticipantDomainModule.createKeyProvisioner(settings),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: JwsKeyRefSource,
        useFactory: (
            settings: ParticipantDomainModule.RequiredSettings,
        ): JwsKeyRefSource | null =>
            ParticipantDomainModule.createKeyRefSource(settings) ?? null,
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: ParticipantSigningKeysCache,
        useFactory: (
            participantRepository: ParticipantRepository,
            participantKeyRepository: ParticipantKeyRepository,
            privateKeySource: JwsPrivateKeySource,
            keyRefSource: JwsKeyRefSource | null,
        ): ParticipantSigningKeysCache => new ParticipantSigningKeysCache(
            participantRepository, participantKeyRepository, privateKeySource,
            keyRefSource ?? undefined),
        inject: [
            ParticipantRepository, ParticipantKeyRepository, JwsPrivateKeySource, JwsKeyRefSource,
        ],
    },
    ParticipantKeyRefStore,
    {
        // Null under every profile but pkcs11, so a deployment holding real keys loads no device
        // library and opens no sessions. Its onModuleInit is what reads the crypto-user credential
        // and logs in -- at startup, so that Vault stays off the signing path.
        provide: Pkcs11Bootstrap,
        useFactory: (
            settings: ParticipantDomainModule.RequiredSettings,
        ): Pkcs11Bootstrap | null =>
            ParticipantDomainModule.createPkcs11Bootstrap(settings),
        inject: [REQUIRED_SETTINGS],
    },
    {
        // Where signing happens, decided once. Both consumers -- web-outbound signing as any
        // payer, and a connector signing as its own tenant -- take this rather than deciding for
        // themselves, so the two cannot drift onto different custody.
        provide: JwsSigner,
        useFactory: (
            settings: ParticipantDomainModule.RequiredSettings,
            cache: ParticipantSigningKeysCache,
            keyRefStore: ParticipantKeyRefStore,
            pkcs11: Pkcs11Bootstrap | null,
        ): JwsSigner =>
            ParticipantDomainModule.createJwsSigner(settings, cache, keyRefStore, pkcs11),
        inject: [
            REQUIRED_SETTINGS, ParticipantSigningKeysCache, ParticipantKeyRefStore,
            {token: Pkcs11Bootstrap, optional: true},
        ],
    },
    {
        // Present only where the DFSP-facing CA is configured. A deployment that does not issue
        // DFSP certificates resolves this to null rather than failing to start, and the operator
        // paths that need it report that it is not configured.
        provide: DfspCertificateIssuer,
        useFactory: (
            settings: ParticipantDomainModule.RequiredSettings,
            certificates: ParticipantCertRepository,
        ): DfspCertificateIssuer | null =>
            ParticipantDomainModule.createCertificateIssuer(settings, certificates),
        inject: [REQUIRED_SETTINGS, ParticipantCertRepository],
    },
];

const CommandHandlers = [
    OnboardFspHandler,
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    UpsertEndpointHandler,
    UpdateAccessKeyHandler,
    UpdateJwsPolicyHandler,
    EnrollDfspCertificateHandler,
    RevokeDfspCertificateHandler,
];

const QueryHandlers = [
    ListCentralLedgerParticipantsHandler,
    ListDfspCertificatesHandler,
    GetDfspCertificateHandler,
];

@Module({})
export class ParticipantDomainModule {

    static forRootAsync(asyncOptions: ParticipantDomainModule.AsyncOptions): DynamicModule {
        return {
            module: ParticipantDomainModule,
            imports: [
                CqrsModule,
                // Imported unconditionally, and harmless where NATS is not configured: an empty
                // NATS_URL leaves the client unconnected rather than failing to start, so services
                // that make no use of it are unaffected.
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: async (...args: unknown[]) => {
                        // Read structurally rather than through the interface. Several apps combine
                        // these settings with a module that already requires natsUrl, and declaring
                        // an optional member of the same name here makes those types incompatible.
                        const settings = await asyncOptions.useFactory(...args) as {
                            natsUrl?: () => string;
                        };

                        return {natsUrl: () => settings.natsUrl?.() ?? ''};
                    },
                }),
                TypeOrmModule.forRootAsync({
                                               connectionName: PIVOTAL_DB_WRITE_CONNECTION_NAME,
                                               target: DbTarget.Write,
                                               imports: asyncOptions.imports ?? [],
                                               inject: asyncOptions.inject ?? [],
                                               useFactory: asyncOptions.useFactory,
                                           }),
                TypeOrmModule.forRootAsync({
                                               connectionName: PIVOTAL_DB_READ_CONNECTION_NAME,
                                               target: DbTarget.Read,
                                               imports: asyncOptions.imports ?? [],
                                               inject: asyncOptions.inject ?? [],
                                               useFactory: asyncOptions.useFactory,
                                           }),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_WRITE_CONNECTION_NAME),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_READ_CONNECTION_NAME),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...ParticipantDomainModule.createProviders(),
            ],
            exports: [
                CqrsModule,
                ...Repositories,
                ...Components,
            ],
        };
    }

    /**
     * Chooses where private keys come from.
     *
     * A deployment that has not declared a `KEY_PROVIDER` keeps the database source, so this change
     * is not a breaking one — but that source is legacy and stores keys in plaintext. Declaring
     * `vault-kv` without configuring Vault **throws**: falling back would leave keys in the database
     * while an operator believed otherwise.
     */
    static createPrivateKeySource(
        settings: ParticipantDomainModule.RequiredSettings,
    ): JwsPrivateKeySource {

        const keyProvider = settings.keyProvider?.() ?? KeyProvider.Database;

        if (keyProvider === KeyProvider.Database) {
            return new DatabaseJwsPrivateKeySource();
        }

        if (keyProvider === KeyProvider.Pkcs11) {
            // No private key exists outside the device, so there is nothing for this source to
            // return. The tenant is not unkeyed -- its key is named by a reference that
            // createKeyRefSource resolves instead.
            return new DeviceHeldJwsPrivateKeySource();
        }

        const vaultSettings = settings.vaultSettings?.();

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.VaultKv}' but Vault is not configured. `
                + 'Set VAULT_ADDRESS, plus VAULT_ROLE for Kubernetes auth or VAULT_TOKEN when '
                + 'VAULT_AUTH_METHOD=token.',
            );
        }

        return new VaultJwsPrivateKeySource(new VaultClient(vaultSettings), vaultSettings);
    }

    /**
     * Chooses where key references come from, for profiles that hold no key material.
     *
     * Returns `undefined` under every other profile so the refresh does no Vault round trips
     * looking for references that will never exist.
     */
    static createKeyRefSource(
        settings: ParticipantDomainModule.RequiredSettings,
    ): JwsKeyRefSource | undefined {

        const keyProvider = settings.keyProvider?.() ?? KeyProvider.Database;

        if (keyProvider !== KeyProvider.Pkcs11) {
            return undefined;
        }

        const vaultSettings = settings.vaultSettings?.();

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            // Refused rather than defaulted, for the same reason the private-key side refuses: a
            // deployment that chose hardware custody and cannot reach the store naming its keys
            // must stop where that is visible, not sign for nobody and look healthy.
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.Pkcs11}' but Vault is not configured. `
                + 'Set VAULT_ADDRESS, plus VAULT_ROLE for Kubernetes auth or VAULT_TOKEN when '
                + 'VAULT_AUTH_METHOD=token.',
            );
        }

        return new VaultJwsKeyRefSource(
            new VaultClient(vaultSettings),
            vaultSettings,
            settings.keyRefPathPrefix?.() ?? undefined,
        );
    }

    /**
     * Builds the device connection under `pkcs11`, and nothing under any other profile.
     */
    static createPkcs11Bootstrap(
        settings: ParticipantDomainModule.RequiredSettings,
    ): Pkcs11Bootstrap | null {

        const keyProvider = settings.keyProvider?.() ?? KeyProvider.Database;

        if (keyProvider !== KeyProvider.Pkcs11) {
            return null;
        }

        const pkcs11Settings = settings.pkcs11Settings?.();

        if (pkcs11Settings == null || !pkcs11Settings.isConfigured()) {
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.Pkcs11}' but the device is not configured. `
                + 'Set PKCS11_MODULE_PATH and HSM_CRED_PATH.',
            );
        }

        const vaultSettings = settings.vaultSettings?.();

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.Pkcs11}' but Vault is not configured. The `
                + 'crypto-user credential is read from Vault, never from configuration.',
            );
        }

        return new Pkcs11Bootstrap(pkcs11Settings, new VaultClient(vaultSettings));
    }

    /**
     * Chooses where signatures are produced.
     *
     * Mirrors {@link createPrivateKeySource}: custody decides both where a key lives and where
     * signing happens, so the two are read from one setting and can never disagree.
     */
    static createJwsSigner(
        settings: ParticipantDomainModule.RequiredSettings,
        cache: ParticipantSigningKeysCache,
        keyRefStore: ParticipantKeyRefStore,
        pkcs11: Pkcs11Bootstrap | null,
    ): JwsSigner {

        const keyProvider = settings.keyProvider?.() ?? KeyProvider.Database;

        if (keyProvider !== KeyProvider.Pkcs11) {
            return new PrivateKeyJwsSigner(new ParticipantJwsPrivateKeyStore(cache));
        }

        if (pkcs11 == null) {
            // Unreachable while both factories read the same setting, and worth failing loudly if
            // that ever stops being true: the alternative is a deployment that chose hardware
            // custody quietly signing in software.
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.Pkcs11}' but no device connection was built.`,
            );
        }

        return new Pkcs11JwsSigner(pkcs11.keySigner, keyRefStore);
    }

    /**
     * Builds the provisioner matching `KEY_PROVIDER`, so a key is created where the same profile
     * will later look for it.
     *
     * Deliberately mirrors {@link createPrivateKeySource}, including its refusal to fall back:
     * provisioning into the wrong custody is worse than failing, because it succeeds visibly while
     * putting a private key somewhere an operator believes it is not.
     *
     * Unlike the read side, `pkcs11` throws from the provisioner rather than from this factory. A
     * deployment on that profile can still start and serve traffic for tenants keyed elsewhere; it
     * simply cannot create new ones until the HSM path exists.
     */
    static createKeyProvisioner(
        settings: ParticipantDomainModule.RequiredSettings,
    ): JwsKeyProvisioner {

        const keyProvider = settings.keyProvider?.() ?? KeyProvider.Database;

        if (keyProvider === KeyProvider.Database) {
            return new DatabaseJwsKeyProvisioner();
        }

        if (keyProvider === KeyProvider.Pkcs11) {

            const bootstrap = ParticipantDomainModule.createPkcs11Bootstrap(settings);
            const vaultSettings = settings.vaultSettings?.();

            if (bootstrap == null || vaultSettings == null) {
                throw new Error(
                    `KEY_PROVIDER is '${KeyProvider.Pkcs11}' but the device or Vault is not `
                    + 'configured, so no key can be created.',
                );
            }

            return new Pkcs11JwsKeyProvisioner(
                new Pkcs11KeyGenerator(bootstrap.pool),
                bootstrap,
                new VaultClient(vaultSettings),
                settings.hsmCredentialPathPrefix?.() ?? 'pivotal/hsmcred',
                settings.keyRefPathPrefix?.() ?? 'pivotal/keyref',
                settings.sharedSigningCryptoUser?.() ?? 'cu_web_outbound',
            );
        }

        const vaultSettings = settings.vaultSettings?.();

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.VaultKv}' but Vault is not configured. `
                + 'Set VAULT_ADDRESS, plus VAULT_ROLE for Kubernetes auth or VAULT_TOKEN when '
                + 'VAULT_AUTH_METHOD=token.',
            );
        }

        return new VaultJwsKeyProvisioner(new VaultClient(vaultSettings), vaultSettings);
    }

    /**
     * Builds the DFSP-facing issuer when a mount is configured.
     *
     * Returns null rather than throwing where it is absent: most deployments front no DFSPs of
     * their own, and issuance is an operator action rather than something on a request path, so a
     * missing configuration should surface when someone tries to enroll — not by refusing to boot
     * every service that imports this module.
     */
    static createCertificateIssuer(
        settings: ParticipantDomainModule.RequiredSettings,
        certificates: ParticipantCertRepository,
    ): DfspCertificateIssuer | null {

        const issuerSettings = settings.dfspCertIssuerSettings?.();
        const vaultSettings = settings.vaultSettings?.();

        if (issuerSettings == null || issuerSettings.mount.length === 0) {
            return null;
        }

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            throw new Error(
                'A DFSP certificate issuer is configured but Vault is not. '
                + 'Set VAULT_ADDRESS, plus VAULT_ROLE for Kubernetes auth or VAULT_TOKEN when '
                + 'VAULT_AUTH_METHOD=token.',
            );
        }

        return new DfspCertificateIssuer(new VaultClient(vaultSettings), certificates, issuerSettings);
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: CentralLedgerAxios,
                useFactory: (settings: ParticipantDomainModule.RequiredSettings): CentralLedgerAxios => new CentralLedgerAxios(
                    settings.centralLedgerUrl(), settings.centralLedgerAxiosParams()),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: CentralLedgerFacade,
                useFactory: (centralLedgerAxios: CentralLedgerAxios): CentralLedgerFacade => new CentralLedgerFacade(centralLedgerAxios),
                inject: [CentralLedgerAxios],
            },
            ...Repositories,
            ...Components,
            ...CommandHandlers,
            ...QueryHandlers,
        ];
    }
}

export namespace ParticipantDomainModule {

    export interface RequiredSettings extends TypeOrmModule.RequiredSettings {

        centralLedgerUrl(): string;

        centralLedgerAxiosParams(): CentralLedgerAxiosParams

        /** Absent means {@link KeyProvider.Database} — legacy, for continuity only. */
        keyProvider?(): KeyProvider;

        /** Required when {@link keyProvider} returns {@link KeyProvider.VaultKv} or
         * {@link KeyProvider.Pkcs11} — both read from Vault, differing in what the path holds. */
        vaultSettings?(): VaultSettings;

        /**
         * Path prefix for key references, under {@link KeyProvider.Pkcs11}. Defaults to
         * `pivotal/keyref` — the path the provisioning runbook writes.
         */
        keyRefPathPrefix?(): string;

        /** Required when {@link keyProvider} returns {@link KeyProvider.Pkcs11}. */
        pkcs11Settings?(): Pkcs11Settings;

        /**
         * Path prefix for tenant crypto-user credentials, under {@link KeyProvider.Pkcs11}.
         * Defaults to `pivotal/hsmcred` — where a custodian writes them at onboarding.
         */
        hsmCredentialPathPrefix?(): string;

        /**
         * Crypto user that signs on tenants' behalf. Named only in the reminder that a newly
         * generated key still has to be shared with it.
         */
        sharedSigningCryptoUser?(): string;

        /** Absent where the deployment issues no DFSP certificates. */
        dfspCertIssuerSettings?(): DfspCertificateIssuer.Settings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
