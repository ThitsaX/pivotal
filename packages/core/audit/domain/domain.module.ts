import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {
    PersistenceConfigurer,
    PersistenceModule,
} from '@shared/persistence';
import {OutboundParties, OutboundQuotes, OutboundTransfers} from './model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME, OutboundPartiesRepository} from './repository';

@Module({
    imports: [
        PersistenceModule,
        ...PersistenceConfigurer.createTypeOrmRootModules(
            MTPA_DB_WRITE_CONNECTION_NAME,
            MTPA_DB_READ_CONNECTION_NAME,
            [OutboundParties, OutboundQuotes, OutboundTransfers],
        ),
        TypeOrmModule.forFeature([OutboundParties, OutboundQuotes, OutboundTransfers], MTPA_DB_WRITE_CONNECTION_NAME),
        TypeOrmModule.forFeature([OutboundParties, OutboundQuotes, OutboundTransfers], MTPA_DB_READ_CONNECTION_NAME),
    ],
    providers: [OutboundPartiesRepository],
    exports: [TypeOrmModule, OutboundPartiesRepository],
})
export class AuditDomainModule {}
