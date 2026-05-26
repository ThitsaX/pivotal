import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {ConnectorPostQuotesPublisher} from '@core/connector/publisher';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(ConnectorPostQuotesPublisher)
        private readonly publisher: ConnectorPostQuotesPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
        const auditCorrelationId = resolveGatewayCorrelationId(
            correlationId,
            request.transactionId,
            request.transactionRequestId,
            request.quoteId,
        );
        const connectorCorrelationId = correlationId?.trim() || auditCorrelationId;
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    request,
                    occurredAt: createdAt,
                },
            ),
        );

        await this.publisher.publish(new ConnectorPostQuotesPublisher.Message(connectorCorrelationId, payerFsp, payeeFsp, request));
        return new HandlePostQuotesCommand.Output();
    }
}
