import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersCommand} from './handle-put-transfers.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
    implements ICommandHandler<HandlePutTransfersCommand, HandlePutTransfersCommand.Output>
{

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersCommand): Promise<HandlePutTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;

        if (response == null) {
            return new HandlePutTransfersCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, transferId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.response(
                TransactionMessage.InvocationPhase.Transfers,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    response,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Transfers.forSuccess(
            payerFsp,
            transferId,
        );

        await this.publisher.publishSuccess(subject, response);

        return new HandlePutTransfersCommand.Output();
    }
}
