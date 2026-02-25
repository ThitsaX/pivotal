import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutPartiesCommand } from './handle-put-parties.command';

@CommandHandler(HandlePutPartiesCommand)
export class HandlePutPartiesHandler
  implements ICommandHandler<HandlePutPartiesCommand>
{
  async execute(command: HandlePutPartiesCommand): Promise<void> {
    // TODO: implement
  }
}
