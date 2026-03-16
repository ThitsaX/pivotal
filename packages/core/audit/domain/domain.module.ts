import {DynamicModule, Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {
    AuditInboundPartiesHandler,
    AuditInboundQuotesHandler,
    AuditInboundTransfersHandler,
    AuditOutboundPartiesHandler,
    AuditOutboundQuotesHandler,
    AuditOutboundTransfersHandler,
} from './command';
import {
    InboundParties,
    InboundQuotes,
    InboundTransfers,
    OutboundParties,
    OutboundQuotes,
    OutboundTransfers,
} from './model';
import {
    FindInboundPartiesHandler,
    FindInboundQuotesHandler,
    FindInboundTransfersHandler,
    FindOutboundPartiesHandler,
    FindOutboundQuotesHandler,
    FindOutboundTransfersHandler,
} from './query';
import {
    InboundPartiesRepository,
    InboundQuotesRepository,
    InboundTransfersRepository,
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
    OutboundPartiesRepository,
    OutboundQuotesRepository,
    OutboundTransfersRepository,
} from './repository';

const Entities = [
    InboundParties,
    InboundQuotes,
    InboundTransfers,
    OutboundParties,
    OutboundQuotes,
    OutboundTransfers,
];

const Repositories = [
    InboundPartiesRepository,
    InboundQuotesRepository,
    InboundTransfersRepository,
    OutboundPartiesRepository,
    OutboundQuotesRepository,
    OutboundTransfersRepository,
];

const CommandHandlers = [
    AuditInboundPartiesHandler,
    AuditInboundQuotesHandler,
    AuditInboundTransfersHandler,
    AuditOutboundPartiesHandler,
    AuditOutboundQuotesHandler,
    AuditOutboundTransfersHandler,
];

const QueryHandlers = [
    FindInboundPartiesHandler,
    FindInboundQuotesHandler,
    FindInboundTransfersHandler,
    FindOutboundPartiesHandler,
    FindOutboundQuotesHandler,
    FindOutboundTransfersHandler,
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

    export interface RequiredDependencies extends TypeOrmModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
