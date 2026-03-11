import {Body, Controller, Headers, HttpCode, HttpStatus, Inject, Param, Post, Put,} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {HandlePostQuotesCommand, HandlePutQuotesCommand, HandlePutQuotesErrorCommand,} from '@core/inbound/domain';
import {ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopHeaders, QuotesIDPutResponse, QuotesPostRequest,} from '@shared/fspiop';

@Controller('quotes')
export class QuotesController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
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
                     @Body() request: QuotesPostRequest): Promise<void> {
        const payerFsp = QuotesController.headerValue(sourceHeader);
        const payeeFsp = QuotesController.headerValue(destinationHeader);

        await this.commandBus.execute(
            new HandlePostQuotesCommand(
                new HandlePostQuotesCommand.Input(payerFsp, payeeFsp, request),
            ),
        );
    }

    @Put(':quoteId')
    @HttpCode(HttpStatus.OK)
    async putQuotes(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: QuotesIDPutResponse,
    ): Promise<void> {
        const payerFsp = QuotesController.headerValue(destinationHeader);
        const payeeFsp = QuotesController.headerValue(sourceHeader);

        await this.commandBus.execute(
            new HandlePutQuotesCommand(
                new HandlePutQuotesCommand.Input(
                    payerFsp,
                    payeeFsp,
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
        @Body() request: ErrorInformationResponse | undefined,
    ): Promise<void> {
        const payerFsp = QuotesController.headerValue(destinationHeader);
        const payeeFsp = QuotesController.headerValue(sourceHeader);
        const error = QuotesController.toErrorInformationObject(request);

        await this.commandBus.execute(
            new HandlePutQuotesErrorCommand(
                new HandlePutQuotesErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    quoteId,
                    error,
                ),
            ),
        );
    }

    private static toErrorInformationObject(response: ErrorInformationResponse | undefined): ErrorInformationObject {
        return {
            errorInformation: response?.errorInformation ?? QuotesController.FALLBACK_ERROR.errorInformation,
        };
    }
}
