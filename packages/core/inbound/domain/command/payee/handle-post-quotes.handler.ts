import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostQuotesCommand } from './handle-post-quotes.command';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
  implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output>
{
  async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
    // TODO: implement
    return new HandlePostQuotesCommand.Output();
  }
}
