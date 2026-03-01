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
import {
    InboundPartiesRequest,
    InboundPartiesResponse,
    InboundQuotesRequest,
    InboundQuotesResponse,
    InboundTransfersRequest,
    InboundTransfersResponse,
    OutboundPartiesRequest,
    OutboundPartiesResponse,
    OutboundQuotesRequest,
    OutboundQuotesResponse,
    OutboundTransfersRequest,
    OutboundTransfersResponse,
} from './model';
import {
    InboundPartiesRequestRepository,
    InboundPartiesResponseRepository,
    InboundQuotesRequestRepository,
    InboundQuotesResponseRepository,
    InboundTransfersRequestRepository,
    InboundTransfersResponseRepository,
    MTPA_DB_READ_CONNECTION_NAME,
    MTPA_DB_WRITE_CONNECTION_NAME,
    OutboundPartiesRequestRepository,
    OutboundPartiesResponseRepository,
    OutboundQuotesRequestRepository,
    OutboundQuotesResponseRepository,
    OutboundTransfersRequestRepository,
    OutboundTransfersResponseRepository,
} from './repository';

const Entities = [
    InboundPartiesRequest,
    InboundPartiesResponse,
    InboundQuotesRequest,
    InboundQuotesResponse,
    InboundTransfersRequest,
    InboundTransfersResponse,
    OutboundPartiesRequest,
    OutboundPartiesResponse,
    OutboundQuotesRequest,
    OutboundQuotesResponse,
    OutboundTransfersRequest,
    OutboundTransfersResponse,
];

const Repositories = [
    InboundPartiesRequestRepository,
    InboundPartiesResponseRepository,
    InboundQuotesRequestRepository,
    InboundQuotesResponseRepository,
    InboundTransfersRequestRepository,
    InboundTransfersResponseRepository,
    OutboundPartiesRequestRepository,
    OutboundPartiesResponseRepository,
    OutboundQuotesRequestRepository,
    OutboundQuotesResponseRepository,
    OutboundTransfersRequestRepository,
    OutboundTransfersResponseRepository,
];

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
            Entities,
        ),
        TypeOrmModule.forFeature(Entities, MTPA_DB_WRITE_CONNECTION_NAME),
        TypeOrmModule.forFeature(Entities, MTPA_DB_READ_CONNECTION_NAME),
    ],
    providers: [...Repositories, ...CommandHandlers],
    exports: [TypeOrmModule, CqrsModule, ...Repositories],
})
export class AuditDomainModule {}
