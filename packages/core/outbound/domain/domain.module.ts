// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule as NestJsTypeOrmModule } from '@nestjs/typeorm';
import { AuditProducerModule } from '@core/audit/producer';
import { Transaction } from '@core/audit/domain/model';
import { PIVOTAL_DB_READ_CONNECTION_NAME } from '@core/audit/domain/repository';
import { FspiopAxios, FspiopPubSubModule, FspiopSettings, FspiopSigningInterceptor, } from '@shared/fspiop';
import { PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler, RegisterMsisdnHandler } from './command';
import { GetDfspListByUsecaseHandler, GetDfspListHandler, GetTransferStatusHandler } from './query';
import { AmountDecimalValidator, OracleCentralRegistryClient, OutboundSettings, PayerProvidedFeesValidator, PrefixOracleClient, RedisClient, TransferStatusRepository } from './component';
import { AmountTypeConstraint } from '@shared/fspiop';
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
                    privateKeyStore: PrivateKeyStore,
                    caStore: CaStore,
                    clientCertStore: ClientCertStore,
                ): FspiopAxios => {

                    const fspiopSettings = outboundSettings.fspiopSettings;
                    const params = outboundSettings.fspiopAxiosParams;

                    const interceptors =
                        fspiopSettings.useJws ? [new FspiopSigningInterceptor(privateKeyStore).build()]
                            : [];

                    const httpsAgent =
                        fspiopSettings.useMutualTls ?
                            new https.Agent(
                                {
                                    ca: caStore.get()?.toBuffer(),
                                    cert: clientCertStore.get()?.certBuffer(),
                                    key: clientCertStore.get()?.keyBuffer(),
                                    rejectUnauthorized: params.verifyServerCertificate,
                                    timeout: params.connectionTimeoutMs,
                                    ...(params.verifyDomain === false
                                        ? { checkServerIdentity: () => undefined }
                                        : {}),
                                })
                            : undefined;

                    return new FspiopAxios(fspiopSettings, params, interceptors, {}, httpsAgent);
                },
                inject: [OutboundSettings, PrivateKeyStore, CaStore, ClientCertStore],
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
