import {Module} from '@nestjs/common';
import {InboundDomainModule} from '@core/inbound/domain';
import {PartiesController, QuotesController, TransfersController,} from './controller';

@Module({
    imports: [InboundDomainModule],
    controllers: [PartiesController, QuotesController, TransfersController],
})
export class ApiInboundModule {}
