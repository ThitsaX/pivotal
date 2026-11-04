// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Param, Post, Put, } from '@nestjs/common';
import { CommandBus, ICommand } from '@nestjs/cqrs';
import { HandlePostQuotesCommand, HandlePutQuotesCommand, HandlePutQuotesErrorCommand, } from '@core/inbound/domain';
import { ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopHeaders, FspiopSettings, QuotesIDPutResponse, QuotesPostRequest, } from '@shared/fspiop';
import { MdcContext } from '@shared/foundation';
import type {OriginalIso20022PostQuotePayload, OriginalIso20022QuoteResponsePayload} from '@shared/iso20022';
import {InboundRepresentation} from './representation';
import {InboundRequestLogger} from './inbound-request-logger';

@Controller('quotes')
export class QuotesController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(QuotesController.name);

    private static async iso20022Transformer(): Promise<typeof import('../../../shared/iso20022/iso20022-transformer').Iso20022Transformer> {
        return (await import('../../../shared/iso20022/iso20022-transformer')).Iso20022Transformer;
    }

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(FspiopSettings)
        private readonly settings: FspiopSettings,
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
    async postQuotes(
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: QuotesPostRequest,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'POST /quotes', request);
        const iso20022PostQuoteRequest = this.originalIso20022Payload<OriginalIso20022PostQuotePayload>(
            contentTypeHeader,
            request,
        );
        const mappedRequest = await this.mapPostQuotes(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: mappedRequest.transactionId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Post Quote Request for TransferId ${mappedRequest.transactionId} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = QuotesController.optionalHeaderValue(traceparentHeader);
                const payerFsp = QuotesController.headerValue(sourceHeader);
                const payeeFsp = QuotesController.headerValue(destinationHeader);

                return new HandlePostQuotesCommand(
                    new HandlePostQuotesCommand.Input(
                        correlationId,
                        payerFsp,
                        payeeFsp,
                        mappedRequest,
                        iso20022PostQuoteRequest,
                    ),
                );
            });
        });
    }

    @Put(':quoteId/error')
    @HttpCode(HttpStatus.OK)
    async putQuotesError(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /quotes/error', request);
        const mappedRequest = await this.mapPutQuotesError(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: quoteId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Put Quote Request Error for QuoteId ${quoteId} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = QuotesController.optionalHeaderValue(traceparentHeader);
                const payerFsp = QuotesController.headerValue(destinationHeader);
                const payeeFsp = QuotesController.headerValue(sourceHeader);
                const error = QuotesController.toErrorInformationObject(mappedRequest);

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
    async putQuotes(
        @Param('quoteId') quoteId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: QuotesIDPutResponse,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /quotes', request);
        const iso20022QuoteResponse = this.originalIso20022Payload<OriginalIso20022QuoteResponsePayload>(
            contentTypeHeader,
            request,
        );
        const mappedRequest = await this.mapPutQuotes(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: quoteId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Put Quote Request for TransferId ${quoteId} : ${JSON.stringify(mappedRequest)}`,
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
                        mappedRequest,
                        iso20022QuoteResponse,
                    ),
                );
            });
        });
    }

    private async mapPostQuotes(contentType: string | string[] | undefined, request: QuotesPostRequest): Promise<QuotesPostRequest> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await QuotesController.iso20022Transformer()).isoPostQuotesToFspiop(request) as QuotesPostRequest
            : request;
    }

    private originalIso20022Payload<TPayload extends Record<string, unknown>>(
        contentType: string | string[] | undefined,
        request: unknown,
    ): TPayload | undefined {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? request as TPayload
            : undefined;
    }

    private async mapPutQuotes(contentType: string | string[] | undefined, request: QuotesIDPutResponse): Promise<QuotesIDPutResponse> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await QuotesController.iso20022Transformer()).isoPutQuotesToFspiop(request) as QuotesIDPutResponse
            : request;
    }

    private async mapPutQuotesError(
        contentType: string | string[] | undefined,
        request: ErrorInformationResponse | undefined,
    ): Promise<ErrorInformationResponse | undefined> {
        return request != null && InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await QuotesController.iso20022Transformer()).isoPutQuotesErrorToFspiop(request) as ErrorInformationResponse
            : request;
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
