import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutTransfersCommand } from '@core/inbound/src';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
  implements ICommandHandler<HandlePutTransfersCommand>
{
  async execute(command: HandlePutTransfersCommand): Promise<void> {
    // TODO: implement
  }
}
