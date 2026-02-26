import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePatchTransfersCommand } from '@core/inbound';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
  implements ICommandHandler<HandlePatchTransfersCommand>
{
  async execute(command: HandlePatchTransfersCommand): Promise<void> {
    // TODO: implement
  }
}
