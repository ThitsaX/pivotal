import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {ConnectorPatchTransfersPublisher} from '@core/connector/publisher';
import {HandlePatchTransfersCommand} from './handle-patch-transfers.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePatchTransfersCommand)
export class HandlePatchTransfersHandler
    implements ICommandHandler<HandlePatchTransfersCommand, HandlePatchTransfersCommand.Output> {

    constructor(
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
        @Inject(ConnectorPatchTransfersPublisher)
        private readonly publisher: ConnectorPatchTransfersPublisher,
    ) {}

    async execute(command: HandlePatchTransfersCommand): Promise<HandlePatchTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;
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
                transferId,
                null,
                response,
                null,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        await this.publisher.publish(
            new ConnectorPatchTransfersPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, transferId, response),
        );
        return new HandlePatchTransfersCommand.Output();
    }
}
