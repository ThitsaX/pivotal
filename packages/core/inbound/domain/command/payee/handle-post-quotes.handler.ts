import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {ConnectorPostQuotesPublisher} from '@core/connector/publisher';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {GATEWAY_RAIL, nextGatewayAuditId, resolveGatewayCorrelationId} from '../gateway-audit';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    constructor(
        @Inject(InboundQuotesAuditPublisher)
        private readonly auditPublisher: InboundQuotesAuditPublisher,
        @Inject(ConnectorPostQuotesPublisher)
        private readonly publisher: ConnectorPostQuotesPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
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
                request.quoteId,
                request,
                null,
                null,
                null,
                createdAt,
                null,
                InboundStageEnum.AT_GATEWAY,
            ),
        );

        await this.publisher.publish(new ConnectorPostQuotesPublisher.Message(auditCorrelationId, payerFsp, payeeFsp, request));
        return new HandlePostQuotesCommand.Output();
    }
}
