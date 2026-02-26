import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DoTransferCommand } from './do-transfer.command';

@CommandHandler(DoTransferCommand)
export class DoTransferHandler
  implements ICommandHandler<DoTransferCommand, DoTransferCommand.Output>
{
  async execute(command: DoTransferCommand): Promise<DoTransferCommand.Output> {
    // TODO: implement
    return new DoTransferCommand.Output();
  }
}
