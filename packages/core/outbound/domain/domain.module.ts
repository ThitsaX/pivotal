import {Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {NatsModule} from '@shared/nats';
import {DoLookupHandler, DoQuotingHandler, DoTransferHandler} from './command';
import {PartiesResponseSubscriber} from './subscriber';

const CommandHandlers = [DoLookupHandler, DoQuotingHandler, DoTransferHandler];

const Subscribers = [PartiesResponseSubscriber];

@Module({
    imports: [CqrsModule, NatsModule],
    providers: [...CommandHandlers, ...Subscribers],
    exports: [CqrsModule, NatsModule, ...Subscribers],
})
export class OutboundDomainModule {}
