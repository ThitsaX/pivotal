import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutTransfersErrorCommand } from '@core/inbound/src';

@CommandHandler(HandlePutTransfersErrorCommand)
export class HandlePutTransfersErrorHandler
  implements ICommandHandler<HandlePutTransfersErrorCommand>
{
  async execute(command: HandlePutTransfersErrorCommand): Promise<void> {
    // TODO: implement
  }
}
