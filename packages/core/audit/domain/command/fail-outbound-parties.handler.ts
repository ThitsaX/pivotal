import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/persistence';
import {OutboundPartiesRepository} from '../repository';
import {FailOutboundPartiesCommand} from './fail-outbound-parties.command';

@CommandHandler(FailOutboundPartiesCommand)
export class FailOutboundPartiesHandler
    implements ICommandHandler<FailOutboundPartiesCommand, FailOutboundPartiesCommand.Output> {

    constructor(private readonly repository: OutboundPartiesRepository) {
    }

    async execute(command: FailOutboundPartiesCommand): Promise<FailOutboundPartiesCommand.Output> {
        const {id, error} = command.input;

        const entity = await this.repository.findById(id, DbTarget.Write);
        if (!entity) {
            throw new Error(`OutboundParties not found for id: ${id}.`);
        }

        entity.fail(error);
        await this.repository.save(entity);

        return new FailOutboundPartiesCommand.Output();
    }
}
