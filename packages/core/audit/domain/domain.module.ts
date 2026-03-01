import {Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {TypeOrmModule} from '@nestjs/typeorm';
import {
    PersistenceConfigurer,
    PersistenceModule,
} from '@shared/persistence';
import {
    CompleteOutboundPartiesHandler,
    FailOutboundPartiesHandler,
    InitiateOutboundPartiesHandler,
} from './command';
import {OutboundParties, OutboundQuotes, OutboundTransfers} from './model';
import {
    MTPA_DB_READ_CONNECTION_NAME,
    MTPA_DB_WRITE_CONNECTION_NAME,
    OutboundPartiesRepository,
    OutboundQuotesRepository,
    OutboundTransfersRepository,
} from './repository';

const CommandHandlers = [
    InitiateOutboundPartiesHandler,
    CompleteOutboundPartiesHandler,
    FailOutboundPartiesHandler,
];

@Module({
    imports: [
        PersistenceModule,
        CqrsModule,
        ...PersistenceConfigurer.createTypeOrmRootModules(
            MTPA_DB_WRITE_CONNECTION_NAME,
            MTPA_DB_READ_CONNECTION_NAME,
            [OutboundParties, OutboundQuotes, OutboundTransfers],
        ),
        TypeOrmModule.forFeature([OutboundParties, OutboundQuotes, OutboundTransfers], MTPA_DB_WRITE_CONNECTION_NAME),
        TypeOrmModule.forFeature([OutboundParties, OutboundQuotes, OutboundTransfers], MTPA_DB_READ_CONNECTION_NAME),
    ],
    providers: [OutboundPartiesRepository, OutboundQuotesRepository, OutboundTransfersRepository, ...CommandHandlers],
    exports: [TypeOrmModule, CqrsModule, OutboundPartiesRepository, OutboundQuotesRepository, OutboundTransfersRepository],
})
export class AuditDomainModule {}
