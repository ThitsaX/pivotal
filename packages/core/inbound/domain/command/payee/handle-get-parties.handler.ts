import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {InboundConnectorPartiesPublisher} from '../../publisher';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(private readonly publisher: InboundConnectorPartiesPublisher) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;
        await this.publisher.publish(
            new InboundConnectorPartiesPublisher.Message(payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId),
        );
        return new HandleGetPartiesCommand.Output();
    }
}
