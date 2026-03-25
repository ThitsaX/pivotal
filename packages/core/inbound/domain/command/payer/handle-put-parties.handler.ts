import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutPartiesCommand} from './handle-put-parties.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutPartiesCommand)
export class HandlePutPartiesHandler
    implements ICommandHandler<HandlePutPartiesCommand, HandlePutPartiesCommand.Output> {

    constructor(
        @Inject(InboundPartiesAuditPublisher)
        private readonly auditPublisher: InboundPartiesAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutPartiesCommand): Promise<HandlePutPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId, response} = command.input;

        if (response == null) {
            return new HandlePutPartiesCommand.Output();
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
                response,
                null,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
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
