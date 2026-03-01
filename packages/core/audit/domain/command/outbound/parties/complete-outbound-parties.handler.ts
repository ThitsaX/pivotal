import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/persistence';
import {OutboundPartiesResponse} from '../../../model';
import {OutboundPartiesRequestRepository, OutboundPartiesResponseRepository} from '../../../repository';
import {CompleteOutboundPartiesCommand} from './complete-outbound-parties.command';

@CommandHandler(CompleteOutboundPartiesCommand)
export class CompleteOutboundPartiesHandler
    implements ICommandHandler<CompleteOutboundPartiesCommand, CompleteOutboundPartiesCommand.Output> {

    constructor(
        private readonly requestRepository: OutboundPartiesRequestRepository,
        private readonly responseRepository: OutboundPartiesResponseRepository,
    ) {
    }

    async execute(command: CompleteOutboundPartiesCommand): Promise<CompleteOutboundPartiesCommand.Output> {
        const {id, response} = command.input;

        const request = await this.requestRepository.findById(id, DbTarget.Write);
        if (!request) {
            throw new Error(`OutboundParties not found for id: ${id}.`);
        }

        var responseEntity = await this.responseRepository.findById(id, DbTarget.Write);
        if (!responseEntity) {
            responseEntity = new OutboundPartiesResponse(id);
        }

        responseEntity.complete(response);
        await this.responseRepository.save(responseEntity);

        return new CompleteOutboundPartiesCommand.Output();
    }
}
