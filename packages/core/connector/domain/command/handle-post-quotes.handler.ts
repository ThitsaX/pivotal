import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {AuditInboundQuotesCommand} from '@core/audit/domain';
import {InboundQuotesAuditPublisher} from '@core/audit/producer';
import {ErrorInformationObject, FspiopErrors, FspiopException} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {HandlePostQuotesCommand} from './handle-post-quotes.command';
import {FspClient} from '../fsp-client';

@CommandHandler(HandlePostQuotesCommand)
export class HandlePostQuotesHandler
    implements ICommandHandler<HandlePostQuotesCommand, HandlePostQuotesCommand.Output> {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly fspClient: FspClient,
        private readonly auditPublisher: InboundQuotesAuditPublisher,
    ) {
    }

    async execute(command: HandlePostQuotesCommand): Promise<HandlePostQuotesCommand.Output> {
        const {payerFsp, payeeFsp, correlationId, request} = command.input;
        const createdAt = new Date();
        const id = HandlePostQuotesHandler.nextAuditId();

        try {
            const response = await this.fspClient.postQuotes(request);

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
                        HandlePostQuotesHandler.toAuditError(error),
                        null,
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
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
