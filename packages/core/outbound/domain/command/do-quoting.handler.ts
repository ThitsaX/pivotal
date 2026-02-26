import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DoQuotingCommand } from './do-quoting.command';

@CommandHandler(DoQuotingCommand)
export class DoQuotingHandler
  implements ICommandHandler<DoQuotingCommand, DoQuotingCommand.Output>
{
  async execute(command: DoQuotingCommand): Promise<DoQuotingCommand.Output> {
    // TODO: implement
    return new DoQuotingCommand.Output();
  }
}
