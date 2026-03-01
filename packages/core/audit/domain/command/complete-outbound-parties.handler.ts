import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/persistence';
import {OutboundPartiesRepository} from '../repository';
import {CompleteOutboundPartiesCommand} from './complete-outbound-parties.command';

@CommandHandler(CompleteOutboundPartiesCommand)
export class CompleteOutboundPartiesHandler
    implements ICommandHandler<CompleteOutboundPartiesCommand, CompleteOutboundPartiesCommand.Output> {

    constructor(private readonly repository: OutboundPartiesRepository) {
    }

    async execute(command: CompleteOutboundPartiesCommand): Promise<CompleteOutboundPartiesCommand.Output> {
        const {id, response} = command.input;

        const entity = await this.repository.findById(id, DbTarget.Write);
        if (!entity) {
            throw new Error(`OutboundParties not found for id: ${id}.`);
        }

        entity.complete(response);
        await this.repository.save(entity);

        return new CompleteOutboundPartiesCommand.Output();
    }
}
