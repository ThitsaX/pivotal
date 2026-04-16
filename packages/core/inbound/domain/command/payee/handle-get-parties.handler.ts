import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {ConnectorGetPartiesPublisher} from '@core/connector/publisher';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(ConnectorGetPartiesPublisher)
        private readonly publisher: ConnectorGetPartiesPublisher,
    ) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
        const auditCorrelationId = resolveGatewayCorrelationId(correlationId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Parties,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    payeeIdType: partyIdType,
                    payeeId: partyId,
                    payeeSubId: subId ?? null,
                    occurredAt: createdAt,
                },
            ),
        );

        await this.publisher.publish(
            new ConnectorGetPartiesPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, partyIdType, partyId, subId),
        );
        return new HandleGetPartiesCommand.Output();
    }
}
