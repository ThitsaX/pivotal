// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuditProducerModule } from '@core/audit/producer';
import { FspiopAxios, FspiopPubSubModule, FspiopSettings, FspiopSigningInterceptor, MutualTlsAgent } from '@shared/fspiop';
import { PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler } from './command';
import { GetDfspListByUsecaseHandler, GetDfspListHandler } from './query';
import { AmountDecimalValidator, OutboundSettings, PrefixOracleClient, RedisClient } from './component';
import { PrivateKeyStore } from "@shared/security";

const REQUIRED_SETTINGS = Symbol('OutboundDomainRequiredSettings');
const CommandHandlers = [PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler];
const QueryHandlers = [
    GetDfspListByUsecaseHandler,
    GetDfspListHandler,
];

@Module({})
export class OutboundDomainModule {

    static forRootAsync(asyncOptions: OutboundDomainModule.AsyncOptions): DynamicModule {
        return {
            module: OutboundDomainModule,
            imports: [
                CqrsModule,
                FspiopPubSubModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                AuditProducerModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...OutboundDomainModule.createProviders(asyncOptions),
            ],
            exports: [CqrsModule, RedisClient],
        };
    }

    private static createProviders(asyncOptions: OutboundDomainModule.AsyncOptions): Provider[] {
        return [
            {
                provide: OutboundSettings,
                useFactory: (settings: OutboundDomainModule.RequiredSettings): OutboundSettings => settings.outboundSettings(),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: FspiopSettings,
                useFactory: (outboundSettings: OutboundSettings): FspiopSettings => outboundSettings.fspiopSettings,
                inject: [OutboundSettings],
            },
            {
                provide: RedisClient,
                useFactory: (outboundSettings: OutboundSettings): RedisClient => {
                    return new RedisClient(outboundSettings.redisUrl, outboundSettings.redisCacheItemTimeoutMs);
                },
                inject: [OutboundSettings],
            },
            {
                provide: AmountDecimalValidator,
                useFactory: (outboundSettings: OutboundSettings): AmountDecimalValidator =>
                    new AmountDecimalValidator(outboundSettings.amountDecimalPlaces),
                inject: [OutboundSettings],
            },
            {
                provide: PrefixOracleClient,
                useFactory: (outboundSettings: OutboundSettings, redisClient: RedisClient): PrefixOracleClient => {
                    return new PrefixOracleClient(
                        outboundSettings.prefixOracleEndpoint,
                        outboundSettings.prefixOracleAxiosParams,
                        redisClient,
                        outboundSettings.prefixOracleCacheTtlMs,
                    );
                },
                inject: [OutboundSettings, RedisClient],
            },
            ...(asyncOptions.providers ?? []),
            {
                provide: FspiopAxios,
                useFactory: (
                    outboundSettings: OutboundSettings,
                    privateKeyStore: PrivateKeyStore,
                ): FspiopAxios => {

                    const fspiopSettings = outboundSettings.fspiopSettings;
                    const params = outboundSettings.fspiopAxiosParams;

                    const interceptors =
                        fspiopSettings.useJws ? [new FspiopSigningInterceptor(privateKeyStore).build()]
                            : [];

                    // Built through MutualTlsAgent so a renewed certificate takes effect
                    // without a restart. cert-manager rewrites the mounted Secret every
                    // few weeks; an agent constructed once would keep presenting the
                    // certificate it started with until the pod was recycled.
                    let mutualTls: MutualTlsAgent | null = null;

                    if (fspiopSettings.useMutualTls) {
                        mutualTls = MutualTlsAgent.create({
                            rejectUnauthorized: params.verifyServerCertificate ?? true,
                            connectionTimeoutMs: params.connectionTimeoutMs,
                            verifyDomain: params.verifyDomain,
                        });

                        // Refusing to start beats starting without a client certificate:
                        // the request would otherwise leave unauthenticated and fail at
                        // the peer as an opaque handshake error, far from the cause.
                        if (mutualTls == null) {
                            throw new Error(
                                'Mutual TLS is enabled but no certificate or trust anchor is configured.');
                        }

                        mutualTls.start();
                    }

                    return new FspiopAxios(
                        fspiopSettings, params, interceptors, {}, mutualTls?.httpsAgent());
                },
                inject: [OutboundSettings, PrivateKeyStore],
            },
            ...CommandHandlers, ...QueryHandlers,
        ];
    }
}

export namespace OutboundDomainModule {

    export interface RequiredSettings
        extends FspiopPubSubModule.RequiredSettings,
        AuditProducerModule.RequiredSettings {

        outboundSettings(): OutboundSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        providers?: Provider[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
