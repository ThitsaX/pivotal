import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand, InboundStageEnum} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {
    FspiopAxios,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {PerformPostQuotesCommand} from './perform-post-quotes.command';
import {AuditErrorConverter, ConnectorSettings, FspConnector} from '../component';

@CommandHandler(PerformPostQuotesCommand)
export class PerformPostQuotesHandler
    implements ICommandHandler<PerformPostQuotesCommand, PerformPostQuotesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundQuotesAuditPublisher)
        private readonly auditPublisher: InboundQuotesAuditPublisher,
    ) {
    }

    async execute(command: PerformPostQuotesCommand): Promise<PerformPostQuotesCommand.Output> {
        const {correlationId, payerFsp, payeeFsp, request} = command.input;
        const {quotesUrl} = this.fspiopAxios.settings;
        const connectorId = this.connectorSettings.connectorId;
        const headers = FspiopHeaders.Values.Quotes.forResult(correlationId, payerFsp, connectorId);
        const createdAt = new Date();
        const id = PerformPostQuotesHandler.nextAuditId();
        const auditCorrelationId = correlationId ?? id;

        try {
            const response = await this.fspConnector.postQuotes(request);

            await this.fspiopAxios.putQuotes(
                quotesUrl,
                headers,
                request.quoteId,
                response,
            );

            await this.auditPublisher.publish(
                new AuditInboundQuotesCommand.Input(
                    id,
                    auditCorrelationId,
                    PerformPostQuotesHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    request.quoteId,
                    request,
                    response,
                    null,
                    null,
                    createdAt,
                    new Date(),
                    InboundStageEnum.AT_CONNECTOR,
                ),
            );
        } catch (error) {
            let callbackError = error;
            let callbackAuditError = AuditErrorConverter.toAuditError(error);
            let callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
            let callbackFspError = AuditErrorConverter.toFspError(error);

            try {
                await this.fspiopAxios.putQuotesError(
                    quotesUrl,
                    headers,
                    request.quoteId,
                    callbackErrorResponse,
                );
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = AuditErrorConverter.toAuditError(putError);
                callbackErrorResponse = AuditErrorConverter.toErrorResponse(callbackAuditError);
                callbackFspError = callbackFspError ?? AuditErrorConverter.toFspError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundQuotesCommand.Input(
                        id,
                        auditCorrelationId,
                        PerformPostQuotesHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        request.quoteId,
                        request,
                        null,
                        callbackAuditError,
                        callbackFspError,
                        createdAt,
                        new Date(),
                        InboundStageEnum.AT_CONNECTOR,
                    ),
                );
            } catch {
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformPostQuotesCommand.Output();
    }

    private static nextAuditId(): string {
        return PerformPostQuotesHandler.SNOWFLAKE.nextId().toString();
    }
}
