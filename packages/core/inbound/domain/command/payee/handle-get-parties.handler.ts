import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ConnectorGetPartiesPublisher} from '@core/connector/publisher';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(
        @Inject(ConnectorGetPartiesPublisher)
        private readonly publisher: ConnectorGetPartiesPublisher,
    ) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
        const connectorCorrelationId = resolveGatewayCorrelationId(correlationId);

        await this.publisher.publish(
            new ConnectorGetPartiesPublisher.Message(connectorCorrelationId, payerFsp, payeeFsp, partyIdType, partyId, subId),
        );
        return new HandleGetPartiesCommand.Output();
    }
}
