import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandleGetPartiesCommand} from '@core/inbound/domain';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {
    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        // TODO: implement
        return new HandleGetPartiesCommand.Output();
    }
}
