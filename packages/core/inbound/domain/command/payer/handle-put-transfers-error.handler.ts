import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundTransfersCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundTransfersAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutTransfersErrorCommand} from './handle-put-transfers-error.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutTransfersErrorCommand)
export class HandlePutTransfersErrorHandler
    implements ICommandHandler<HandlePutTransfersErrorCommand, HandlePutTransfersErrorCommand.Output>
{

    constructor(
        @Inject(InboundTransfersAuditPublisher)
        private readonly auditPublisher: InboundTransfersAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutTransfersErrorCommand): Promise<HandlePutTransfersErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, transferId, error} = command.input;

        if (error == null) {
            return new HandlePutTransfersErrorCommand.Output();
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
                null,
                error,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        const subject = FspiopPubSubSubjects.Transfers.forError(
            payerFsp,
            transferId,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutTransfersErrorCommand.Output();
    }
}
