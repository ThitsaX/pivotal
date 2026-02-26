import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutTransfersCommand } from './handle-put-transfers.command';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
  implements ICommandHandler<HandlePutTransfersCommand, HandlePutTransfersCommand.Output>
{
  async execute(command: HandlePutTransfersCommand): Promise<HandlePutTransfersCommand.Output> {
    // TODO: implement
    return new HandlePutTransfersCommand.Output();
  }
}
