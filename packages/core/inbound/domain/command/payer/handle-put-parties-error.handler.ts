import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HandlePutPartiesErrorCommand } from './handle-put-parties-error.command';

@CommandHandler(HandlePutPartiesErrorCommand)
export class HandlePutPartiesErrorHandler
  implements ICommandHandler<HandlePutPartiesErrorCommand, HandlePutPartiesErrorCommand.Output>
{
  async execute(command: HandlePutPartiesErrorCommand): Promise<HandlePutPartiesErrorCommand.Output> {
    // TODO: implement
    return new HandlePutPartiesErrorCommand.Output();
  }
}
