import {Module} from '@nestjs/common';
import {NatsModule} from '@shared/nats';
import {PartiesResponsePublisher} from './component';

const Publishers = [PartiesResponsePublisher];

@Module({
    imports: [NatsModule],
    providers: [...Publishers],
    exports: [...Publishers],
})
export class OutboundPublisherModule {}
