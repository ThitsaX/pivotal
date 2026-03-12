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
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {FspConnector} from '../component';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        @Inject(FspConnector)
        private readonly fspConnector: FspConnector,
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(InboundQuotesAuditPublisher)
        private readonly auditPublisher: InboundQuotesAuditPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, request} = command.input;
        const {switchBaseUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Quotes.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandlePostQuotesHandler.nextAuditId();

        try {
            const response = await this.fspConnector.postQuotes(request);

            await this.fspiopAxios
                .withHeaders(headers)
                .putQuotes(switchBaseUrl, request.quoteId, response);

            await this.auditPublisher.publish(
                new AuditInboundQuotesCommand.Input(
                    id,
                    HandlePostQuotesHandler.RAIL,
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
            let callbackAuditError = HandlePostQuotesHandler.toAuditError(error);
            let callbackErrorResponse = HandlePostQuotesHandler.toErrorResponse(callbackAuditError);

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putQuotesError(switchBaseUrl, request.quoteId, callbackErrorResponse);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandlePostQuotesHandler.toAuditError(putError);
                callbackErrorResponse = HandlePostQuotesHandler.toErrorResponse(callbackAuditError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundQuotesCommand.Input(
                        id,
                        HandlePostQuotesHandler.RAIL,
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

        return new HandlePostQuotesCommand.Output();
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
        return HandlePostQuotesHandler.SNOWFLAKE.nextId().toString();
    }
}
