import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AuditOutboundQuotesCommand} from '@core/audit/domain';
import {OutboundQuotesAuditPublisher} from '@core/audit/producer';
import {DoQuotingCommand} from '@core/outbound/domain';
import {
    ErrorInformationObject,
    FspiopErrors,
    FspiopException,
    QuotesIDPutResponse,
    QuotesPostRequest,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';

@Controller('quote')
export class QuoteController {

    private static readonly RAIL = 'fspiop';
    private static readonly SNOWFLAKE = Snowflake.get();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly auditPublisher: OutboundQuotesAuditPublisher,
    ) {
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    async quote(@Body() request: QuoteController.Request): Promise<QuoteController.Response> {
        const createdAt = new Date();
        const id = QuoteController.nextAuditId();

        try {
            const input = new DoQuotingCommand.Input(
                request.correlationId,
                request.source,
                request.destination,
                request.quoteId,
                request.request,
            );

            const output: DoQuotingCommand.Output = await this.commandBus.execute(
                new DoQuotingCommand(input),
            );

            await this.auditPublisher.publish(
                new AuditOutboundQuotesCommand.Input(
                    id,
                    QuoteController.RAIL,
                    request.source,
                    request.destination,
                    request.correlationId,
                    request.quoteId,
                    request.request,
                    output.response,
                    null,
                    createdAt,
                    new Date(),
                ),
            );

            return new QuoteController.Response(output.response);
        } catch (error) {
            try {
                await this.auditPublisher.publish(
                    new AuditOutboundQuotesCommand.Input(
                        id,
                        QuoteController.RAIL,
                        request.source,
                        request.destination,
                        request.correlationId,
                        request.quoteId,
                        request.request,
                        null,
                        QuoteController.toAuditError(error),
                        createdAt,
                        new Date(),
                    ),
                );
            } finally {
                throw error;
            }
        }
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
        return QuoteController.SNOWFLAKE.nextId().toString();
    }
}

export namespace QuoteController {

    export class Request {
        correlationId!: string;
        source!: string;
        destination!: string;
        quoteId!: string;
        request!: QuotesPostRequest;
    }

    export class Response {
        constructor(public readonly response: QuotesIDPutResponse) {
        }
    }
}
