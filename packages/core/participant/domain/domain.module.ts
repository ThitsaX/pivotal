// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {CentralLedgerAxios, CentralLedgerAxiosParams, CentralLedgerFacade} from '@shared/central-ledger';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {KeyProvider, VaultClient, VaultSettings} from '@shared/vault';
import {
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    OnboardFspHandler,
    UpdateAccessKeyHandler,
    UpsertEndpointHandler,
} from './command';
import {Participant, ParticipantKey} from './model';
import {ListCentralLedgerParticipantsHandler} from './query';
import {
    ParticipantKeyRepository,
    ParticipantRepository,
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
} from './repository';
import {ParticipantSigningKeysCache} from "@core/participant/domain/component/store/participant-signing-keys-cache";
import {
    DatabaseJwsPrivateKeySource,
    JwsPrivateKeySource,
    VaultJwsPrivateKeySource,
} from './component/store/jws-private-key-source';

const REQUIRED_SETTINGS = Symbol('ParticipantDomainRequiredSettings');

const Entities = [
    Participant,
    ParticipantKey,
];

const Repositories = [
    ParticipantRepository,
    ParticipantKeyRepository,
];

const Components: Provider[] = [
    {
        provide: JwsPrivateKeySource,
        useFactory: (settings: ParticipantDomainModule.RequiredSettings): JwsPrivateKeySource =>
            ParticipantDomainModule.createPrivateKeySource(settings),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: ParticipantSigningKeysCache,
        useFactory: (
            participantRepository: ParticipantRepository,
            participantKeyRepository: ParticipantKeyRepository,
            privateKeySource: JwsPrivateKeySource,
        ): ParticipantSigningKeysCache => new ParticipantSigningKeysCache(
            participantRepository, participantKeyRepository, privateKeySource),
        inject: [ParticipantRepository, ParticipantKeyRepository, JwsPrivateKeySource],
    },
];

const CommandHandlers = [
    OnboardFspHandler,
    AddFspCurrencyHandler,
    AddHubCurrencyHandler,
    AddSigningKeysHandler,
    UpsertEndpointHandler,
    UpdateAccessKeyHandler,
];

const QueryHandlers = [
    ListCentralLedgerParticipantsHandler,
];

@Module({})
export class ParticipantDomainModule {

    static forRootAsync(asyncOptions: ParticipantDomainModule.AsyncOptions): DynamicModule {
        return {
            module: ParticipantDomainModule,
            imports: [
                CqrsModule,
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
            throw new Error(
                `KEY_PROVIDER '${KeyProvider.Pkcs11}' is not implemented yet. `
                + `Use '${KeyProvider.VaultKv}' or '${KeyProvider.Database}'.`,
            );
        }

        const vaultSettings = settings.vaultSettings?.();

        if (vaultSettings == null || !vaultSettings.isConfigured()) {
            throw new Error(
                `KEY_PROVIDER is '${KeyProvider.VaultKv}' but Vault is not configured. `
                + 'Set VAULT_ADDRESS and VAULT_ROLE.',
            );
        }

        return new VaultJwsPrivateKeySource(new VaultClient(vaultSettings), vaultSettings);
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

        /** Required when {@link keyProvider} returns {@link KeyProvider.VaultKv}. */
        vaultSettings?(): VaultSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
