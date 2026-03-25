import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundPartiesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundPartiesAuditPublisher} from '@core/audit/producer';
import {ConnectorGetPartiesPublisher} from '@core/connector/publisher';
import {HandleGetPartiesCommand} from './handle-get-parties.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandleGetPartiesCommand)
export class HandleGetPartiesHandler
    implements ICommandHandler<HandleGetPartiesCommand, HandleGetPartiesCommand.Output> {

    constructor(
        @Inject(InboundPartiesAuditPublisher)
        private readonly auditPublisher: InboundPartiesAuditPublisher,
        @Inject(ConnectorGetPartiesPublisher)
        private readonly publisher: ConnectorGetPartiesPublisher,
    ) {
    }

    async execute(command: HandleGetPartiesCommand): Promise<HandleGetPartiesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, partyIdType, partyId, subId} = command.input;
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
                null,
                null,
                createdAt,
                null,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        await this.publisher.publish(
            new ConnectorGetPartiesPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, partyIdType, partyId, subId),
        );
        return new HandleGetPartiesCommand.Output();
    }
}
