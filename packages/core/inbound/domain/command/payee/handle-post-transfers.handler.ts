import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePostTransfersCommand } from './handle-post-transfers.command';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
  implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output>
{
  async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
    // TODO: implement
    return new HandlePostTransfersCommand.Output();
  }
}
