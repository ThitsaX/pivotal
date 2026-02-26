import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostQuotesCommand } from '@core/inbound';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
  implements ICommandHandler<HandlePostQuotesCommand>
{
  async execute(command: HandlePostQuotesCommand): Promise<void> {
    // TODO: implement
  }
}
