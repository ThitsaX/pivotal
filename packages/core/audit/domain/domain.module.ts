import {DynamicModule, Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {TypeOrmModule, TypeOrmSettings} from '@shared/typeorm';
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
    MTPA_DB_READ_CONNECTION_NAME,
    MTPA_DB_WRITE_CONNECTION_NAME,
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
                    connectionName: MTPA_DB_WRITE_CONNECTION_NAME,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: async (...args) => {
                        const deps = await asyncOptions.useFactory(...args);
                        return {typeOrmSettings: () => deps.writeTypeOrmSettings()};
                    },
                }),
                TypeOrmModule.forRootAsync({
                    connectionName: MTPA_DB_READ_CONNECTION_NAME,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: async (...args) => {
                        const deps = await asyncOptions.useFactory(...args);
                        return {typeOrmSettings: () => deps.readTypeOrmSettings()};
                    },
                }),
                NestJsTypeOrmModule.forFeature(Entities, MTPA_DB_WRITE_CONNECTION_NAME),
                NestJsTypeOrmModule.forFeature(Entities, MTPA_DB_READ_CONNECTION_NAME),
            ],
            providers: [...Repositories, ...CommandHandlers],
            exports: [CqrsModule, ...Repositories],
        };
    }
}

export namespace AuditDomainModule {

    export interface RequiredDependencies {
        writeTypeOrmSettings(): TypeOrmSettings;
        readTypeOrmSettings(): TypeOrmSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
