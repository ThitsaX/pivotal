import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutQuotesCommand } from './handle-put-quotes.command';

@CommandHandler(HandlePutQuotesCommand)
export class HandlePutQuotesHandler
  implements ICommandHandler<HandlePutQuotesCommand, HandlePutQuotesCommand.Output>
{
  async execute(command: HandlePutQuotesCommand): Promise<HandlePutQuotesCommand.Output> {
    // TODO: implement
    return new HandlePutQuotesCommand.Output();
  }
}
