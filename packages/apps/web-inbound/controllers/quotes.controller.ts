import {Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Put,} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {HandlePostQuotesCommand, HandlePutQuotesCommand, HandlePutQuotesErrorCommand,} from '@core/inbound/domain';
import {ErrorInformationObject, FspiopHeaders, QuotesIDPutResponse, QuotesPostRequest,} from '@shared/fspiop';

@Controller('quotes')
export class QuotesController {

    constructor(private readonly commandBus: CommandBus) {
    }

    private static headerValue(value: string | string[] | undefined, fallback = ''): string {
        if (value == null) {
            return fallback;
        }

        if (Array.isArray(value)) {
            return value[0] ?? fallback;
        }

        return value;
    }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    async postQuotes(@Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
                     @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
                     @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
                     @Body() request: QuotesPostRequest): Promise<void> {
        const payerFsp = QuotesController.headerValue(destinationHeader);
        const payeeFsp = QuotesController.headerValue(sourceHeader);
        const correlationId = QuotesController.headerValue(correlationIdHeader, request.quoteId);

        await this.commandBus.execute(
            new HandlePostQuotesCommand(
                new HandlePostQuotesCommand.Input(payerFsp, payeeFsp, correlationId, request),
            ),
        );
    }

    @Put(':quoteId')
    @HttpCode(HttpStatus.OK)
    async putQuotes(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() request: QuotesIDPutResponse,
    ): Promise<void> {
        const payerFsp = QuotesController.headerValue(destinationHeader);
        const payeeFsp = QuotesController.headerValue(sourceHeader);
        const correlationId = QuotesController.headerValue(correlationIdHeader, quoteId);

        await this.commandBus.execute(
            new HandlePutQuotesCommand(
                new HandlePutQuotesCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    quoteId,
                    request,
                ),
            ),
        );
    }

    @Put(':quoteId/error')
    @HttpCode(HttpStatus.OK)
    async putQuotesError(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() request: ErrorInformationObject,
    ): Promise<void> {
        const payerFsp = QuotesController.headerValue(destinationHeader);
        const payeeFsp = QuotesController.headerValue(sourceHeader);
        const correlationId = QuotesController.headerValue(correlationIdHeader, quoteId);

        await this.commandBus.execute(
            new HandlePutQuotesErrorCommand(
                new HandlePutQuotesErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    quoteId,
                    request,
                ),
            ),
        );
    }
}
