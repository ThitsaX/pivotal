// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule as NestJsTypeOrmModule } from '@nestjs/typeorm';
import { AuditProducerModule } from '@core/audit/producer';
import { Transaction } from '@core/audit/domain/model';
import { PIVOTAL_DB_READ_CONNECTION_NAME } from '@core/audit/domain/repository';
import { AmountTypeConstraint, FspiopAccessTokenProvider, FspiopAxios, FspiopBearerTokenInterceptor, FspiopPubSubModule, FspiopSettings, FspiopSigningInterceptor, JwsSigner, MutualTlsAgent } from '@shared/fspiop';
import { PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler, RegisterMsisdnHandler } from './command';
import { GetDfspListByUsecaseHandler, GetDfspListHandler, GetTransferStatusHandler } from './query';
import { AmountDecimalValidator, HasPayeeFspIdConstraint, OracleCentralRegistryClient, OutboundSettings, PayerProvidedFeesValidator, PrefixOracleClient, RedisClient, SuspiciousTransactionMonitor, TransferStatusRepository } from './component';
import * as https from "node:https";
import { CaStore, ClientCertStore, PrivateKeyStore } from "@shared/security";

const REQUIRED_SETTINGS = Symbol('OutboundDomainRequiredSettings');
const CommandHandlers = [
    PostSendMoneyHandler,
    PutAcceptPartyHandler,
    PutAcceptQuoteHandler,
    RegisterMsisdnHandler,
];
const QueryHandlers = [
    GetDfspListByUsecaseHandler,
    GetDfspListHandler,
    GetTransferStatusHandler,
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
                NestJsTypeOrmModule.forFeature([Transaction], PIVOTAL_DB_READ_CONNECTION_NAME),
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
                provide: SuspiciousTransactionMonitor,
                useFactory: (
                    outboundSettings: OutboundSettings,
                    redisClient: RedisClient,
                ): SuspiciousTransactionMonitor =>
                    new SuspiciousTransactionMonitor(
                        redisClient,
                        outboundSettings.suspiciousTxnWindowMs,
                        outboundSettings.suspiciousTxnThreshold,
                        outboundSettings.suspiciousTxnMonitoringEnabled,
                        outboundSettings.suspiciousTxnMatchingFields,
                    ),
                inject: [OutboundSettings, RedisClient],
            },
            {
                provide: AmountDecimalValidator,
                useFactory: (outboundSettings: OutboundSettings): AmountDecimalValidator =>
                    new AmountDecimalValidator(outboundSettings.amountDecimalPlaces),
                inject: [OutboundSettings],
            },
            {
                provide: PayerProvidedFeesValidator,
                useFactory: (
                    outboundSettings: OutboundSettings,
                    amountDecimalValidator: AmountDecimalValidator,
                ): PayerProvidedFeesValidator =>
                    new PayerProvidedFeesValidator(
                        outboundSettings.checkPayerFeeAsMandatory,
                        amountDecimalValidator,
                ),
                inject: [OutboundSettings, AmountDecimalValidator],
            },
            TransferStatusRepository,
            {                                                                                                                                                                       
                provide: AmountTypeConstraint,
                useFactory: (outboundSettings: OutboundSettings): AmountTypeConstraint => 
                    new AmountTypeConstraint(outboundSettings.strictAmountType), 
                inject: [OutboundSettings],
            },
            {
                provide: HasPayeeFspIdConstraint,
                useFactory: (outboundSettings: OutboundSettings): HasPayeeFspIdConstraint =>
                    new HasPayeeFspIdConstraint(outboundSettings.postSendmoneyPayeeFspIdRequired),
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
            {
                provide: OracleCentralRegistryClient,
                useFactory: (outboundSettings: OutboundSettings): OracleCentralRegistryClient => {
                    return new OracleCentralRegistryClient(
                        outboundSettings.centralRegistryOracleEndpoint,
                        outboundSettings.centralRegistryOracleAxiosParams,
                    );
                },
                inject: [OutboundSettings],
            },
            ...(asyncOptions.providers ?? []),
            {
                provide: FspiopAxios,
                useFactory: (
                    outboundSettings: OutboundSettings,
                    jwsSigner: JwsSigner,
                ): FspiopAxios => {

                    const fspiopSettings = outboundSettings.fspiopSettings;
                    const params = outboundSettings.fspiopAxiosParams;

                    const interceptors = [
                        ...(outboundSettings.hubAccessToken != null
                            ? [new FspiopBearerTokenInterceptor(
                                new FspiopAccessTokenProvider(outboundSettings.hubAccessToken)).build()]
                            : []),
                        ...(fspiopSettings.useJws
                            ? [new FspiopSigningInterceptor(jwsSigner).build()]
                            : []),
                    ];

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
                inject: [OutboundSettings, JwsSigner],
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
