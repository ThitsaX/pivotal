// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantDomainModule} from '@core/participant/domain';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios, McmSettings} from '@shared/mcm-client';
import {PeerJwsSyncScheduler} from './component';

const REQUIRED_SETTINGS = Symbol('TrustDomainRequiredSettings');

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
            exports: [McmAxios, PeerJwsSyncScheduler],
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
    }

    export interface AsyncOptions {
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
    }
}
