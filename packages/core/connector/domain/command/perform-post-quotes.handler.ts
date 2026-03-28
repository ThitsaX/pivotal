import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {TransactionMessage} from '@core/audit/common';
import {AuditTransactionPublisher} from '@core/audit/producer';
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
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
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

        await this.auditPublisher.publish(
            TransactionMessage.request(
                TransactionMessage.InvocationPhase.Quotes,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: auditCorrelationId,
                    payerFsp,
                    payeeFsp,
                    request,
                    occurredAt: createdAt,
                },
            ),
        );

        try {
            const response = await this.fspConnector.postQuotes(request);

            await this.fspiopAxios.putQuotes(
                quotesUrl,
                headers,
                request.quoteId,
                response,
            );

            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Quotes,
                    TransactionMessage.InvocationGateway.Connector,
                    {
                        correlationId: auditCorrelationId,
                        payerFsp,
                        payeeFsp,
                        request,
                        response,
                        occurredAt: new Date(),
                    },
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
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Quotes,
                        TransactionMessage.InvocationGateway.Connector,
                        {
                            correlationId: auditCorrelationId,
                            payerFsp,
                            payeeFsp,
                            request,
                            error: callbackFspError == null
                                ? callbackAuditError
                                : {audit: callbackAuditError, fspError: callbackFspError},
                            occurredAt: new Date(),
                        },
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
