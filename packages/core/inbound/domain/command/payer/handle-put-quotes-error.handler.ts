import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesErrorCommand} from './handle-put-quotes-error.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutQuotesErrorCommand)
export class HandlePutQuotesErrorHandler
    implements ICommandHandler<HandlePutQuotesErrorCommand, HandlePutQuotesErrorCommand.Output>
{

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesErrorCommand): Promise<HandlePutQuotesErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, quoteId, error} = command.input;

        if (error == null) {
            return new HandlePutQuotesErrorCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.error(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    error,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Quotes.forError(
            payerFsp,
            quoteId,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutQuotesErrorCommand.Output();
    }
}
