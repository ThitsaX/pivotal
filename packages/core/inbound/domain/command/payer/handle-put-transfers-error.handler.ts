import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutTransfersErrorCommand } from './handle-put-transfers-error.command';

@CommandHandler(HandlePutTransfersErrorCommand)
export class HandlePutTransfersErrorHandler
  implements ICommandHandler<HandlePutTransfersErrorCommand, HandlePutTransfersErrorCommand.Output>
{
  async execute(command: HandlePutTransfersErrorCommand): Promise<HandlePutTransfersErrorCommand.Output> {
    // TODO: implement
    return new HandlePutTransfersErrorCommand.Output();
  }
}
