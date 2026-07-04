// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {DynamicModule, Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {
    AuditPartiesErrorHandler,
    AuditPartiesRequestHandler,
    AuditPartiesResponseHandler,
    AuditPatchErrorHandler,
    AuditPatchRequestHandler,
    AuditPatchResponseHandler,
    AuditQuotesErrorHandler,
    AuditQuotesRequestHandler,
    AuditQuotesResponseHandler,
    AuditTransfersErrorHandler,
    AuditTransfersRequestHandler,
    AuditTransfersResponseHandler,
    CreateTransactionReportHandler,
    DisputeTransactionHandler,
} from './command';
import {ReportDownloadRequest, ReportDownloadRequestParam, Transaction} from './model';
import {
    CountTransactionsHandler,
    FindTransactionsHandler,
    GetDashboardHandler,
    GetReportDownloadStatusHandler,
    GetReportDownloadUrlHandler,
    GetTransactionHandler,
} from './query';
import {
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
    ReportDownloadRepository,
    TransactionRepository,
    TransactionRollupRepository,
} from './repository';
import {
    REPORT_DOWNLOAD_SETTINGS,
    ReportDownloadProcessor,
    ReportDownloadSettings,
    S3ReportStorage,
    TransactionReportGenerator,
} from './reporting';

const Entities = [Transaction, ReportDownloadRequest, ReportDownloadRequestParam];

const Repositories = [TransactionRepository, TransactionRollupRepository, ReportDownloadRepository];

const CommandHandlers = [
    AuditPartiesErrorHandler,
    AuditPartiesRequestHandler,
    AuditPartiesResponseHandler,
    AuditPatchErrorHandler,
    AuditPatchRequestHandler,
    AuditPatchResponseHandler,
    AuditQuotesErrorHandler,
    AuditQuotesRequestHandler,
    AuditQuotesResponseHandler,
    AuditTransfersErrorHandler,
    AuditTransfersRequestHandler,
    AuditTransfersResponseHandler,
    DisputeTransactionHandler,
    CreateTransactionReportHandler,
];

const QueryHandlers = [
    GetTransactionHandler,
    FindTransactionsHandler,
    CountTransactionsHandler,
    GetDashboardHandler,
    GetReportDownloadStatusHandler,
    GetReportDownloadUrlHandler,
];

const ReportingProviders = [
    S3ReportStorage,
    TransactionReportGenerator,
    ReportDownloadProcessor,
];

@Module({})
export class AuditDomainModule {

    static forRootAsync(asyncOptions: AuditDomainModule.AsyncOptions): DynamicModule {
        return {
            module: AuditDomainModule,
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
            ],
            providers: [
                ...Repositories,
                ...CommandHandlers,
                ...QueryHandlers,
                ...ReportingProviders,
                {
                    provide: REPORT_DOWNLOAD_SETTINGS,
                    useFactory: async (...args: any[]): Promise<ReportDownloadSettings> => {
                        const settings = await asyncOptions.useFactory(...args);
                        return settings.reportDownloadSettings?.() ?? ReportDownloadSettings.DEFAULTS;
                    },
                    inject: asyncOptions.inject ?? [],
                },
            ],
            exports: [CqrsModule, ...Repositories, S3ReportStorage],
        };
    }
}

export namespace AuditDomainModule {

    export interface RequiredSettings extends TypeOrmModule.RequiredSettings {
        reportDownloadSettings?(): ReportDownloadSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
