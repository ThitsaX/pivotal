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
    DisputeTransactionHandler,
} from './command';
import {Transaction} from './model';
import {CountTransactionsHandler, FindTransactionsHandler, GetTransactionHandler} from './query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME, TransactionRepository,} from './repository';

const Entities = [Transaction];

const Repositories = [TransactionRepository];

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
];

const QueryHandlers = [
    GetTransactionHandler,
    FindTransactionsHandler,
    CountTransactionsHandler,
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
            providers: [...Repositories, ...CommandHandlers, ...QueryHandlers],
            exports: [CqrsModule, ...Repositories],
        };
    }
}

export namespace AuditDomainModule {

    export interface RequiredSettings extends TypeOrmModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
