import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutPartiesErrorCommand } from '@core/inbound';

@CommandHandler(HandlePutPartiesErrorCommand)
export class HandlePutPartiesErrorHandler
  implements ICommandHandler<HandlePutPartiesErrorCommand>
{
  async execute(command: HandlePutPartiesErrorCommand): Promise<void> {
    // TODO: implement
  }
}
