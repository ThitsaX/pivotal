// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {CommandBus} from '@nestjs/cqrs';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {
    AuditDomainModule,
    LiveStatsStore,
    LiveStatsWriter,
    RollupLock,
    TransactionRollupRepository,
    TransactionRollupScheduler,
} from '../domain';
import {
    AuditTransactionConsumer,
} from './listener';

const TRANSACTION_ROLLUP_LOCK_KEY = 'pivotal:transaction-rollup:lock';
const ROLLUP_SETTINGS = Symbol('AUDIT_CONSUMER_ROLLUP_SETTINGS');

@Module({})
export class AuditConsumerModule {

    static forRootAsync(asyncOptions: AuditConsumerModule.AsyncOptions): DynamicModule {
        return {
            module: AuditConsumerModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                AuditDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                ...AuditConsumerModule.createProviders(asyncOptions),
            ],
            exports: [
                AuditTransactionConsumer,
            ],
        };
    }

    private static createProviders(asyncOptions: AuditConsumerModule.AsyncOptions): Provider[] {
        return [
            {
                provide: AuditTransactionConsumer,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus, liveStats: LiveStatsWriter) =>
                    new AuditTransactionConsumer(ncs, commandBus, liveStats),
                inject: [NatsClientService, CommandBus, LiveStatsWriter],
            },
            // Settings resolved once for the rollup providers (ConfigService is global in the host app).
            {
                provide: ROLLUP_SETTINGS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
            // Distributed lock so only one app-auditor replica refreshes the rollup per tick.
            {
                provide: RollupLock,
                useFactory: (settings: AuditConsumerModule.RequiredSettings) =>
                    new RollupLock(settings.redisUrl(), TRANSACTION_ROLLUP_LOCK_KEY),
                inject: [ROLLUP_SETTINGS],
            },
            // Near-real-time counter store (own Redis client; written per-event by every replica,
            // reseeded by the scheduler's reconciliation).
            {
                provide: LiveStatsStore,
                useFactory: (settings: AuditConsumerModule.RequiredSettings) =>
                    new LiveStatsStore(settings.redisUrl()),
                inject: [ROLLUP_SETTINGS],
            },
            // Per-event live counter writer (classifies the transaction + applies the delta).
            {
                provide: LiveStatsWriter,
                useFactory: (repository: TransactionRollupRepository, store: LiveStatsStore) =>
                    new LiveStatsWriter(repository, store),
                inject: [TransactionRollupRepository, LiveStatsStore],
            },
            // Periodic rollup refresh (lifecycle-managed: starts its own setInterval on init).
            // Also reconciles the live counters from the freshly rebuilt rollup each tick.
            {
                provide: TransactionRollupScheduler,
                useFactory: (
                    settings: AuditConsumerModule.RequiredSettings,
                    repository: TransactionRollupRepository,
                    lock: RollupLock,
                    liveStats: LiveStatsStore,
                ) =>
                    new TransactionRollupScheduler(
                        repository,
                        lock,
                        settings.transactionRollupIntervalSeconds() * 1000,
                        liveStats,
                    ),
                inject: [ROLLUP_SETTINGS, TransactionRollupRepository, RollupLock, LiveStatsStore],
            },
        ];
    }
}

export namespace AuditConsumerModule {

    export interface RequiredSettings
        extends NatsClientServiceModule.RequiredSettings,
                AuditDomainModule.RequiredSettings {
        redisUrl(): string;
        transactionRollupIntervalSeconds(): number;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
