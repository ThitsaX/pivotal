import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {FspiopPubSubSubjects, FspiopResponsePublisher} from '@shared/fspiop';
import {HandlePutQuotesCommand} from './handle-put-quotes.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePutQuotesCommand)
export class HandlePutQuotesHandler
    implements ICommandHandler<HandlePutQuotesCommand, HandlePutQuotesCommand.Output> {

    constructor(
        @Inject(InboundQuotesAuditPublisher)
        private readonly auditPublisher: InboundQuotesAuditPublisher,
        @Inject(FspiopResponsePublisher)
        private readonly publisher: FspiopResponsePublisher,
    ) {
    }

    async execute(command: HandlePutQuotesCommand): Promise<HandlePutQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, quoteId, response} = command.input;

        if (response == null) {
            return new HandlePutQuotesCommand.Output();
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
                response,
                null,
                null,
                createdAt,
                createdAt,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        const subject = FspiopPubSubSubjects.Quotes.forSuccess(
            payerFsp,
            quoteId,
        );

        this.publisher.publishSuccess(subject, response);

        return new HandlePutQuotesCommand.Output();
    }
}
