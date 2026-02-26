import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  DoLookupHandler,
  DoQuotingHandler,
  DoTransferHandler,
} from './command';

const CommandHandlers = [DoLookupHandler, DoQuotingHandler, DoTransferHandler];

@Module({
  imports: [CqrsModule],
  providers: [...CommandHandlers],
  exports: [CqrsModule],
})
export class OutboundDomainModule {}
