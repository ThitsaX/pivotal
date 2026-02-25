import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutTransfersCommand } from './handle-put-transfers.command';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
  implements ICommandHandler<HandlePutTransfersCommand>
{
  async execute(command: HandlePutTransfersCommand): Promise<void> {
    // TODO: implement
  }
}
