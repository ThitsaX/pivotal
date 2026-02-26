import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePatchTransfersCommand } from './handle-patch-transfers.command';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
  implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output>
{
  async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
    // TODO: implement
    return new HandlePatchTransfersCommand.Output();
  }
}
