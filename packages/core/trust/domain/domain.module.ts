// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantDomainModule} from '@core/participant/domain';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios, McmSettings} from '@shared/mcm-client';
import {
    HubCaSyncScheduler,
    JwsKeyPublishScheduler,
    KubernetesSecretWriter,
    McmCaRegistrationScheduler,
    PeerJwsSyncScheduler,
} from './component';

const REQUIRED_SETTINGS = Symbol('TrustDomainRequiredSettings');
const HUB_CA_LOCK = Symbol('TrustDomainHubCaLock');
const CA_REGISTRATION_LOCK = Symbol('TrustDomainCaRegistrationLock');
const JWS_PUBLISH_LOCK = Symbol('TrustDomainJwsPublishLock');

const Components: Provider[] = [
    {
        provide: McmAxios,
        useFactory: (settings: TrustDomainModule.RequiredSettings): McmAxios =>
            new McmAxios(settings.mcmSettings()),
        inject: [REQUIRED_SETTINGS],
    },
    {
        // Named for its first caller; it is a generic Redis SET-NX lock and takes the
        // key as an argument. See PeerJwsSyncScheduler.
        provide: RollupLock,
        useFactory: (settings: TrustDomainModule.RequiredSettings): RollupLock =>
            new RollupLock(settings.redisUrl(), 'pivotal:trust:peer-jws-sync'),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: PeerJwsSyncScheduler,
        useFactory: (
            mcm: McmAxios,
            participantKeys: ParticipantKeyRepository,
            lock: RollupLock,
            settings: TrustDomainModule.RequiredSettings,
        ): PeerJwsSyncScheduler => new PeerJwsSyncScheduler(
            mcm, participantKeys, lock, settings.peerJwsSyncIntervalMs(),
        ),
        inject: [McmAxios, ParticipantKeyRepository, RollupLock, REQUIRED_SETTINGS],
    },
    {
        provide: KubernetesSecretWriter,
        useFactory: (): KubernetesSecretWriter => new KubernetesSecretWriter(),
    },
    {
        // A second lock, keyed separately: the two jobs run on very different
        // cadences, and one holding the other's key would stall it for an hour.
        provide: HUB_CA_LOCK,
        useFactory: (settings: TrustDomainModule.RequiredSettings): RollupLock =>
            new RollupLock(settings.redisUrl(), 'pivotal:trust:hub-ca-sync'),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: HubCaSyncScheduler,
        useFactory: (
            mcm: McmAxios,
            secrets: KubernetesSecretWriter,
            lock: RollupLock,
            settings: TrustDomainModule.RequiredSettings,
        ): HubCaSyncScheduler => new HubCaSyncScheduler(
            mcm, secrets, lock, settings.hubCaSecretName(), settings.hubCaSyncIntervalMs(),
        ),
        inject: [McmAxios, KubernetesSecretWriter, HUB_CA_LOCK, REQUIRED_SETTINGS],
    },
    {
        provide: CA_REGISTRATION_LOCK,
        useFactory: (settings: TrustDomainModule.RequiredSettings): RollupLock =>
            new RollupLock(settings.redisUrl(), 'pivotal:trust:mcm-ca-registration'),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: McmCaRegistrationScheduler,
        useFactory: (
            mcm: McmAxios,
            participantKeys: ParticipantKeyRepository,
            lock: RollupLock,
            settings: TrustDomainModule.RequiredSettings,
        ): McmCaRegistrationScheduler => new McmCaRegistrationScheduler(
            mcm, participantKeys, lock, settings.pivotalCaUrl(), settings.mcmCaReconcileIntervalMs(),
        ),
        inject: [McmAxios, ParticipantKeyRepository, CA_REGISTRATION_LOCK, REQUIRED_SETTINGS],
    },
    {
        provide: JWS_PUBLISH_LOCK,
        useFactory: (settings: TrustDomainModule.RequiredSettings): RollupLock =>
            new RollupLock(settings.redisUrl(), 'pivotal:trust:jws-key-publish'),
        inject: [REQUIRED_SETTINGS],
    },
    {
        provide: JwsKeyPublishScheduler,
        useFactory: (
            mcm: McmAxios,
            participantKeys: ParticipantKeyRepository,
            lock: RollupLock,
            settings: TrustDomainModule.RequiredSettings,
        ): JwsKeyPublishScheduler => new JwsKeyPublishScheduler(
            mcm, participantKeys, lock, settings.jwsKeyPublishIntervalMs(),
        ),
        inject: [McmAxios, ParticipantKeyRepository, JWS_PUBLISH_LOCK, REQUIRED_SETTINGS],
    },
];

@Module({})
export class TrustDomainModule {

    static forRootAsync(asyncOptions: TrustDomainModule.AsyncOptions): DynamicModule {
        return {
            module: TrustDomainModule,
            imports: [
                ...(asyncOptions.imports ?? []),
                ParticipantDomainModule.forRootAsync({
                    imports: asyncOptions.imports,
                    inject: asyncOptions.inject,
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
                    inject: asyncOptions.inject,
                    useFactory: asyncOptions.useFactory,
                },
                ...Components,
            ],
            exports: [
            McmAxios,
            PeerJwsSyncScheduler,
            HubCaSyncScheduler,
            McmCaRegistrationScheduler,
            JwsKeyPublishScheduler,
        ],
        };
    }
}

export namespace TrustDomainModule {

    /**
     * Extends the participant domain's settings because this module owns
     * `participant_key` writes and therefore needs its repositories and connections.
     */
    export interface RequiredSettings extends ParticipantDomainModule.RequiredSettings {

        mcmSettings(): McmSettings;

        redisUrl(): string;

        /** Freshness knob only — the sync is idempotent, so a missed tick costs nothing. */
        peerJwsSyncIntervalMs(): number;

        /** The Secret that holds the Hub CA trust bundle. */
        hubCaSecretName(): string;

        /** The Hub CA rotates rarely, so this poll is a slow backstop. */
        hubCaSyncIntervalMs(): number;

        /**
         * Vault PKI's CA endpoint for the Hub-facing trust domain. Unauthenticated:
         * a CA certificate is public, and Vault serves it without a credential.
         */
        pivotalCaUrl(): string;

        mcmCaReconcileIntervalMs(): number;

        jwsKeyPublishIntervalMs(): number;
    }

    export interface AsyncOptions {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
    }
}
