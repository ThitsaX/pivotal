import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/persistence';
import {OutboundPartiesResponse} from '../../../model';
import {OutboundPartiesRequestRepository, OutboundPartiesResponseRepository} from '../../../repository';
import {FailOutboundPartiesCommand} from './fail-outbound-parties.command';

@CommandHandler(FailOutboundPartiesCommand)
export class FailOutboundPartiesHandler
    implements ICommandHandler<FailOutboundPartiesCommand, FailOutboundPartiesCommand.Output> {

    constructor(
        private readonly requestRepository: OutboundPartiesRequestRepository,
        private readonly responseRepository: OutboundPartiesResponseRepository,
    ) {
    }

    async execute(command: FailOutboundPartiesCommand): Promise<FailOutboundPartiesCommand.Output> {
        const {id, error} = command.input;

        const request = await this.requestRepository.findById(id, DbTarget.Write);
        if (!request) {
            throw new Error(`OutboundParties not found for id: ${id}.`);
        }

        var responseEntity = await this.responseRepository.findById(id, DbTarget.Write);
        if (!responseEntity) {
            responseEntity = new OutboundPartiesResponse(id);
        }

        responseEntity.fail(error);
        await this.responseRepository.save(responseEntity);

        return new FailOutboundPartiesCommand.Output();
    }
}
