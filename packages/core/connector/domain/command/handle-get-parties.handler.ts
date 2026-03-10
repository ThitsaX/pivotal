import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {FspClient} from '../fsp-client';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(private readonly fspClient: FspClient) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId} = command.input;

        await this.fspClient.getParties(
            new FspClient.GetPartiesInput(payerFsp, payeeFsp, correlationId, partyIdType, partyId, subId),
        );

        return new HandleGetPartiesCommand.Output();
    }
}
