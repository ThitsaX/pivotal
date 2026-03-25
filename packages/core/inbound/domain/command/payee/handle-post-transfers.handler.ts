import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {ConnectorPostTransfersPublisher} from '@core/connector/publisher';
import {HandlePostTransfersCommand} from './handle-post-transfers.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePostTransfersCommand)
export class HandlePostTransfersHandler
    implements ICommandHandler<HandlePostTransfersCommand, HandlePostTransfersCommand.Output> {

    constructor(
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
        @Inject(ConnectorPostTransfersPublisher)
        private readonly publisher: ConnectorPostTransfersPublisher,
    ) {
    }

    async execute(command: HandlePostTransfersCommand): Promise<HandlePostTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
        const auditId = nextGatewayAuditId();
        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, auditId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            new AuditInboundTransfersCommand.Input(
                auditId,
                auditCorrelationId,
                GATEWAY_RAIL,
                payerFsp,
                payeeFsp,
                request.transferId,
                request,
                null,
                null,
                null,
                createdAt,
                null,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        await this.publisher.publish(new ConnectorPostTransfersPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, request));
        return new HandlePostTransfersCommand.Output();
    }
}
