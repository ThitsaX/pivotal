import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  HandleGetPartiesHandler,
  HandlePatchTransfersHandler,
  HandlePostQuotesHandler,
  HandlePostTransfersHandler,
} from './command/payee';
import {
  HandlePutPartiesErrorHandler,
  HandlePutPartiesHandler,
  HandlePutQuotesErrorHandler,
  HandlePutQuotesHandler,
  HandlePutTransfersErrorHandler,
  HandlePutTransfersHandler,
} from './command/payer';

const CommandHandlers = [
  // Payee
  HandleGetPartiesHandler,
  HandlePostQuotesHandler,
  HandlePostTransfersHandler,
  HandlePatchTransfersHandler,
  // Payer
  HandlePutPartiesHandler,
  HandlePutPartiesErrorHandler,
  HandlePutQuotesHandler,
  HandlePutQuotesErrorHandler,
  HandlePutTransfersHandler,
  HandlePutTransfersErrorHandler,
];

@Module({
  imports: [CqrsModule],
  providers: [...CommandHandlers],
  exports: [CqrsModule],
})
export class InboundDomainModule {}
