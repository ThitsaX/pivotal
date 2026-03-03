import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {InboundPartiesPublisher} from '../../publisher';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(private readonly publisher: InboundPartiesPublisher) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;
        await this.publisher.publish(
            new InboundPartiesPublisher.Input(payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId),
        );
        return new HandleGetPartiesCommand.Output();
    }
}
