import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandleGetPartiesCommand } from '@core/inbound';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
  implements ICommandHandler<HandleGetPartiesCommand>
{
  async execute(command: HandleGetPartiesCommand): Promise<void> {
    // TODO: implement
  }
}
