import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesErrorCommand} from './handle-put-parties-error.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutPartiesErrorCommand)
export class HandlePutPartiesErrorHandler
    implements ICommandHandler<HandlePutPartiesErrorCommand, HandlePutPartiesErrorCommand.Output> {

    constructor(
        @Inject(InboundPartiesAuditPublisher)
        private readonly auditPublisher: InboundPartiesAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesErrorCommand): Promise<HandlePutPartiesErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId, error} = command.input;

        if (error == null) {
            return new HandlePutPartiesErrorCommand.Output();
        }

        const auditId = nextGatewayAuditId();
        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, auditId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            new AuditInboundPartiesCommand.Input(
                auditId,
                auditCorrelationId,
                GATEWAY_RAIL,
                payerFsp,
                payeeFsp,
                partyIdType,
                partyId,
                subId,
                null,
                error,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
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
