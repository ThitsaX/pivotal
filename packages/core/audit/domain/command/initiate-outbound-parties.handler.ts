import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {OutboundParties} from '../model';
import {OutboundPartiesRepository} from '../repository';
import {InitiateOutboundPartiesCommand} from './initiate-outbound-parties.command';

@CommandHandler(InitiateOutboundPartiesCommand)
export class InitiateOutboundPartiesHandler
    implements ICommandHandler<InitiateOutboundPartiesCommand, InitiateOutboundPartiesCommand.Output> {

    constructor(private readonly repository: OutboundPartiesRepository) {
    }

    async execute(command: InitiateOutboundPartiesCommand): Promise<InitiateOutboundPartiesCommand.Output> {
        const {rail, payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;

        const entity = new OutboundParties(
            rail,
            payerFsp,
            payeeFsp,
            correlationId,
            partyIdType,
            partyId,
            subId,
        );

        const saved = await this.repository.save(entity);

        return new InitiateOutboundPartiesCommand.Output(saved.id);
    }
}
