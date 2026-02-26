import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {
    PgTypeConfigurer,
    PgTypeModule,
} from '@shared/pgtype';
import {OutboundParties} from './model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME, OutboundPartiesRepository} from './repository';

@Module({
    imports: [
        PgTypeModule,
        ...PgTypeConfigurer.createTypeOrmRootModules(
            MTPA_DB_WRITE_CONNECTION_NAME,
            MTPA_DB_READ_CONNECTION_NAME,
            [OutboundParties],
        ),
        TypeOrmModule.forFeature([OutboundParties], MTPA_DB_WRITE_CONNECTION_NAME),
        TypeOrmModule.forFeature([OutboundParties], MTPA_DB_READ_CONNECTION_NAME),
    ],
    providers: [OutboundPartiesRepository],
    exports: [TypeOrmModule, OutboundPartiesRepository],
})
export class AuditDomainModule {}
