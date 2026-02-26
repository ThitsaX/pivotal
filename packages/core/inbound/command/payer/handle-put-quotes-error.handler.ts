import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutQuotesErrorCommand } from '@core/inbound';

@CommandHandler(HandlePutQuotesErrorCommand)
export class HandlePutQuotesErrorHandler
  implements ICommandHandler<HandlePutQuotesErrorCommand>
{
  async execute(command: HandlePutQuotesErrorCommand): Promise<void> {
    // TODO: implement
  }
}
