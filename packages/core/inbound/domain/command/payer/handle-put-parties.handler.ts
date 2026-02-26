import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutPartiesCommand } from './handle-put-parties.command';

@CommandHandler(HandlePutPartiesCommand)
export class HandlePutPartiesHandler
  implements ICommandHandler<HandlePutPartiesCommand, HandlePutPartiesCommand.Output>
{
  async execute(command: HandlePutPartiesCommand): Promise<HandlePutPartiesCommand.Output> {
    // TODO: implement
    return new HandlePutPartiesCommand.Output();
  }
}
