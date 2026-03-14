import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopAxios,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {PerformPostQuotesCommand} from './perform-post-quotes.command';
import {ConnectorSettings, FspConnector} from '../component';

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
        const {payerFsp, payeeFsp, request} = command.input;
        const {quotesUrl} = this.fspiopAxios.settings;
        const connectorId = this.connectorSettings.connectorId;
        const headers = FspiopHeaders.Values.Quotes.forResult(payerFsp, connectorId);
        const createdAt = new Date();
        const id = PerformPostQuotesHandler.nextAuditId();

        try {
            const response = await this.fspConnector.postQuotes(request);

            await this.fspiopAxios
                .withHeaders(headers)
                .putQuotes(quotesUrl, request.quoteId, response);

            await this.auditPublisher.publish(
                new AuditInboundQuotesCommand.Input(
                    id,
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
                ),
            );
        } catch (error) {
            let callbackError = error;
            let callbackAuditError = PerformPostQuotesHandler.toAuditError(error);
            let callbackErrorResponse = PerformPostQuotesHandler.toErrorResponse(callbackAuditError);

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putQuotesError(quotesUrl, request.quoteId, callbackErrorResponse);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = PerformPostQuotesHandler.toAuditError(putError);
                callbackErrorResponse = PerformPostQuotesHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundQuotesCommand.Input(
                        id,
                        PerformPostQuotesHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        request.quoteId,
                        request,
                        null,
                        callbackAuditError,
                        null,
                        createdAt,
                        new Date(),
                    ),
                );
            } catch {
                // Preserve the callback error as the command failure.
            }

            FspiopException.rethrow(callbackError);
        }

        return new PerformPostQuotesCommand.Output();
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        try {
            FspiopException.rethrow(error);
        } catch (normalizedError) {
            return (normalizedError as FspiopException).toErrorObject();
        }
    }

    private static toErrorResponse(error: ErrorInformationObject): ErrorInformationResponse {
        return {errorInformation: error.errorInformation};
    }

    private static nextAuditId(): string {
        return PerformPostQuotesHandler.SNOWFLAKE.nextId().toString();
    }
}
