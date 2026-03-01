import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {OutboundPartiesRequest} from '../../../model';
import {OutboundPartiesRequestRepository} from '../../../repository';
import {InitiateOutboundPartiesCommand} from './initiate-outbound-parties.command';

@CommandHandler(InitiateOutboundPartiesCommand)
export class InitiateOutboundPartiesHandler
    implements ICommandHandler<InitiateOutboundPartiesCommand, InitiateOutboundPartiesCommand.Output> {

    constructor(private readonly requestRepository: OutboundPartiesRequestRepository) {
    }

    async execute(command: InitiateOutboundPartiesCommand): Promise<InitiateOutboundPartiesCommand.Output> {
        const {id, rail, payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;

        const entity = new OutboundPartiesRequest(
            id,
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            partyIdType,
            partyId,
            subId,
        );

        const saved = await this.requestRepository.save(entity);

        return new InitiateOutboundPartiesCommand.Output(saved.id);
    }
}
