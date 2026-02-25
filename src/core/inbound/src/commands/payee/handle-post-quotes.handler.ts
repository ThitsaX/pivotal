import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostQuotesCommand } from '@core/inbound/src/commands';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
  implements ICommandHandler<HandlePostQuotesCommand>
{
  async execute(command: HandlePostQuotesCommand): Promise<void> {
    // TODO: implement
  }
}
