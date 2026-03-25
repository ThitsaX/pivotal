import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersCommand} from './handle-put-transfers.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutTransfersCommand)
export class HandlePutTransfersHandler
    implements ICommandHandler<HandlePutTransfersCommand, HandlePutTransfersCommand.Output>
{

    constructor(
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersCommand): Promise<HandlePutTransfersCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, response} = command.input;

        if (response == null) {
            return new HandlePutTransfersCommand.Output();
        }

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

        const subject = FspiopPubSubSubjects.Transfers.forSuccess(
            payerFsp,
            transferId,
        );

        this.publisher.publishSuccess(subject, response);

        return new HandlePutTransfersCommand.Output();
    }
}
