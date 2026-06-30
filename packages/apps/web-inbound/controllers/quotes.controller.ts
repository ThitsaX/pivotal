import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Param, Post, Put, } from '@nestjs/common';
import { CommandBus, ICommand } from '@nestjs/cqrs';
import { HandlePostQuotesCommand, HandlePutQuotesCommand, HandlePutQuotesErrorCommand, } from '@core/inbound/domain';
import { ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopHeaders, QuotesIDPutResponse, QuotesPostRequest, } from '@shared/fspiop';
import { MdcContext } from '@shared/foundation';

@Controller('quotes')
export class QuotesController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(QuotesController.name);

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

    private static optionalHeaderValue(value: string | string[] | undefined): string | null {
        const header = QuotesController.headerValue(value).trim();
        return header.length > 0 ? header : null;
    }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    postQuotes(@Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: QuotesPostRequest): void {
        MdcContext.run({[MdcContext.TRANSFER_ID]: request.transactionId}, () => {
        this.dispatch(() => {
            this.logger.log(
                `Post Quote Request for TransferId ${request.transactionId} : ${JSON.stringify(request)}`,
            );
            const correlationId = QuotesController.optionalHeaderValue(traceparentHeader);
            const payerFsp = QuotesController.headerValue(sourceHeader);
            const payeeFsp = QuotesController.headerValue(destinationHeader);

            return new HandlePostQuotesCommand(
                new HandlePostQuotesCommand.Input(correlationId, payerFsp, payeeFsp, request),
            );
            });
        });
    }

    @Put(':quoteId/error')
    @HttpCode(HttpStatus.OK)
    putQuotesError(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): void {
        MdcContext.run({[MdcContext.TRANSFER_ID]: quoteId}, () => {
        this.dispatch(() => {
            this.logger.log(
                `Put Quote Request Error for QuoteId ${quoteId} : ${JSON.stringify(request)}`,
            );
            const correlationId = QuotesController.optionalHeaderValue(traceparentHeader);
            const payerFsp = QuotesController.headerValue(destinationHeader);
            const payeeFsp = QuotesController.headerValue(sourceHeader);
            const error = QuotesController.toErrorInformationObject(request);

            return new HandlePutQuotesErrorCommand(
                new HandlePutQuotesErrorCommand.Input(
                    correlationId,
                    payerFsp,
                    payeeFsp,
                    quoteId,
                    error,
                ),
            );
            });
        });
    }

    @Put(':quoteId')
    @HttpCode(HttpStatus.OK)
    putQuotes(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: QuotesIDPutResponse,
    ): void {
        MdcContext.run({[MdcContext.TRANSFER_ID]: quoteId}, () => {
        this.dispatch(() => {
            this.logger.log(
                `Put Quote Request for TransferId ${quoteId} : ${JSON.stringify(request)}`,
            );
            const correlationId = QuotesController.optionalHeaderValue(traceparentHeader);
            const payerFsp = QuotesController.headerValue(destinationHeader);
            const payeeFsp = QuotesController.headerValue(sourceHeader);

            return new HandlePutQuotesCommand(
                new HandlePutQuotesCommand.Input(
                    correlationId,
                    payerFsp,
                    payeeFsp,
                    quoteId,
                    request,
                ),
            );
            });
        });
    }


    private static toErrorInformationObject(response: ErrorInformationResponse | undefined): ErrorInformationObject {
        return {
            errorInformation: response?.errorInformation ?? QuotesController.FALLBACK_ERROR.errorInformation,
        };
    }

    private dispatch(commandFactory: () => ICommand): void {
        setImmediate(() => {
            void this.commandBus.execute(commandFactory())
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    const stack = error instanceof Error ? error.stack : undefined;
                    this.logger.error(message, stack);
                });
        });
    }
}
