import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {
    ErrorInformationObject,
    FspiopAxios,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {FspClient} from '../component';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly fspClient: FspClient,
        private readonly fspiopAxios: FspiopAxios,
        private readonly auditPublisher: InboundQuotesAuditPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        const {switchBaseUrl} = this.fspiopAxios.settings;
        const headers = FspiopHeaders.Values.Quotes.forResult(payerFsp, payeeFsp);
        const createdAt = new Date();
        const id = HandlePostQuotesHandler.nextAuditId();

        try {
            const response = await this.fspClient.postQuotes(request);

            await this.fspiopAxios
                .withHeaders(headers)
                .putQuotes(switchBaseUrl, request.quoteId, response);

            await this.auditPublisher.publish(
                new AuditInboundQuotesCommand.Input(
                    id,
                    HandlePostQuotesHandler.RAIL,
                    payerFsp,
                    payeeFsp,
                    correlationId,
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

            try {
                await this.fspiopAxios
                    .withHeaders(headers)
                    .putQuotesError(switchBaseUrl, request.quoteId, callbackAuditError);
            } catch (putError) {
                callbackError = putError;
                callbackAuditError = HandlePostQuotesHandler.toAuditError(putError);
            }

            try {
                await this.auditPublisher.publish(
                    new AuditInboundQuotesCommand.Input(
                        id,
                        HandlePostQuotesHandler.RAIL,
                        payerFsp,
                        payeeFsp,
                        correlationId,
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

            throw callbackError;
        }

        return new HandlePostQuotesCommand.Output();
    }

    private static toAuditError(error: unknown): ErrorInformationObject {
        if (error instanceof FspiopException) {
            return error.toErrorObject();
        }

        const message = error instanceof Error
            ? error.message
            : FspiopErrors.INTERNAL_SERVER_ERROR.description;

        return new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, message).toErrorObject();
    }

    private static nextAuditId(): string {
        return HandlePostQuotesHandler.SNOWFLAKE.nextId().toString();
    }
}
