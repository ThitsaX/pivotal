import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutQuotesCommand } from './handle-put-quotes.command';

@CommandHandler(HandlePutQuotesCommand)
export class HandlePutQuotesHandler
  implements ICommandHandler<HandlePutQuotesCommand>
{
  async execute(command: HandlePutQuotesCommand): Promise<void> {
    // TODO: implement
  }
}
