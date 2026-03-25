import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesErrorCommand} from './handle-put-quotes-error.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutQuotesErrorCommand)
export class HandlePutQuotesErrorHandler
    implements ICommandHandler<HandlePutQuotesErrorCommand, HandlePutQuotesErrorCommand.Output>
{

    constructor(
        @Inject(InboundQuotesAuditPublisher)
        private readonly auditPublisher: InboundQuotesAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesErrorCommand): Promise<HandlePutQuotesErrorCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, quoteId, error} = command.input;

        if (error == null) {
            return new HandlePutQuotesErrorCommand.Output();
        }

        const auditId = nextGatewayAuditId();
        const auditCorrelationId = resolveGatewayCorrelationId(correlationId, auditId);
        const createdAt = new Date();

        await this.auditPublisher.publish(
            new AuditInboundQuotesCommand.Input(
                auditId,
                auditCorrelationId,
                GATEWAY_RAIL,
                payerFsp,
                payeeFsp,
                quoteId,
                null,
                null,
                error,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        const subject = FspiopPubSubSubjects.Quotes.forError(
            payerFsp,
            quoteId,
        );

        this.publisher.publishError(subject, error);

        return new HandlePutQuotesErrorCommand.Output();
    }
}
