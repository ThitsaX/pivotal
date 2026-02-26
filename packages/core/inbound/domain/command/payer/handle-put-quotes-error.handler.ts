import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutQuotesErrorCommand } from './handle-put-quotes-error.command';

@CommandHandler(HandlePutQuotesErrorCommand)
export class HandlePutQuotesErrorHandler
  implements ICommandHandler<HandlePutQuotesErrorCommand, HandlePutQuotesErrorCommand.Output>
{
  async execute(command: HandlePutQuotesErrorCommand): Promise<HandlePutQuotesErrorCommand.Output> {
    // TODO: implement
    return new HandlePutQuotesErrorCommand.Output();
  }
}
