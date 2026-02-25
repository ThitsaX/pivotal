import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostTransfersCommand } from './handle-post-transfers.command';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
  implements ICommandHandler<HandlePostTransfersCommand>
{
  async execute(command: HandlePostTransfersCommand): Promise<void> {
    // TODO: implement
  }
}
