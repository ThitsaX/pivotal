import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesErrorCommand} from './handle-put-parties-error.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutPartiesErrorCommand)
export class HandlePutPartiesErrorHandler
    implements ICommandHandler<HandlePutPartiesErrorCommand, HandlePutPartiesErrorCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesErrorCommand): Promise<HandlePutPartiesErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId, error} = command.input;

        if (error == null) {
            return new HandlePutPartiesErrorCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.error(
                TransactionMessage.InvocationPhase.Parties,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    payeeIdType: partyIdType,
                    payeeId: partyId,
                    payeeSubId: subId ?? null,
                    error,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Parties.forError(
            payerFsp,
            payeeFsp,
            partyIdType,
            partyId,
            subId ?? undefined,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutPartiesErrorCommand.Output();
    }
}
