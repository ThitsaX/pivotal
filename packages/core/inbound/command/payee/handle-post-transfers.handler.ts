import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostTransfersCommand } from '@core/inbound';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
  implements ICommandHandler<HandlePostTransfersCommand>
{
  async execute(command: HandlePostTransfersCommand): Promise<void> {
    // TODO: implement
  }
}
