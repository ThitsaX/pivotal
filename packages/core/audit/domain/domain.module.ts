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
    InboundPartiesRepository,
    InboundQuotesRepository,
    InboundTransfersRepository,
    PAYPORT_DB_READ_CONNECTION_NAME,
    PAYPORT_DB_WRITE_CONNECTION_NAME,
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

@Module({})
export class AuditDomainModule {

    static forRootAsync(asyncOptions: AuditDomainModule.AsyncOptions): DynamicModule {
        return {
            module: AuditDomainModule,
            imports: [
                CqrsModule,
                TypeOrmModule.forRootAsync({
                    connectionName: PAYPORT_DB_WRITE_CONNECTION_NAME,
                    target: DbTarget.Write,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                TypeOrmModule.forRootAsync({
                    connectionName: PAYPORT_DB_READ_CONNECTION_NAME,
                    target: DbTarget.Read,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                NestJsTypeOrmModule.forFeature(Entities, PAYPORT_DB_WRITE_CONNECTION_NAME),
                NestJsTypeOrmModule.forFeature(Entities, PAYPORT_DB_READ_CONNECTION_NAME),
            ],
            providers: [...Repositories, ...CommandHandlers],
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
