import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  HandleGetPartiesHandler,
  HandlePostQuotesHandler,
  HandlePostTransfersHandler,
  HandlePatchTransfersHandler,
} from './commands/payee';
import {
  HandlePutPartiesHandler,
  HandlePutPartiesErrorHandler,
  HandlePutQuotesHandler,
  HandlePutQuotesErrorHandler,
  HandlePutTransfersHandler,
  HandlePutTransfersErrorHandler,
} from './commands/payer';

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
export class InboundModule {}
