import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesCommand} from './handle-put-parties.command';
import {resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutPartiesCommand)
export class HandlePutPartiesHandler
    implements ICommandHandler<HandlePutPartiesCommand, HandlePutPartiesCommand.Output> {

    constructor(
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesCommand): Promise<HandlePutPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId, response} = command.input;

        if (response == null) {
            return new HandlePutPartiesCommand.Output();
        }

        const auditCorrelationId = resolveGatewayCorrelationId(correlationId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            TransactionMessage.response(
                TransactionMessage.InvocationPhase.Parties,
                TransactionMessage.InvocationGateway.Inbound,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    payeeIdType: partyIdType,
                    payeeId: partyId,
                    payeeSubId: subId ?? null,
                    response,
                    occurredAt: createdAt,
                },
            ),
        );

        const subject = FspiopPubSubSubjects.Parties.forSuccess(
            payerFsp,
            payeeFsp,
            partyIdType,
            partyId,
            subId ?? undefined,
        );

        this.publisher.publishSuccess(subject, response);

        return new HandlePutPartiesCommand.Output();
    }
}
