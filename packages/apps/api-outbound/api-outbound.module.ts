import {Module} from '@nestjs/common';
import {OutboundDomainModule} from '@core/outbound/domain';
import {LookupController, QuotingController, TransferController,} from './controller';

@Module({
    imports: [OutboundDomainModule],
    controllers: [LookupController, QuotingController, TransferController],
})
export class ApiOutboundModule {}
