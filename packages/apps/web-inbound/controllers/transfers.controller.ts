// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Param, Patch, Post, Put, } from '@nestjs/common';
import { CommandBus, ICommand } from '@nestjs/cqrs';
import { HandlePatchTransfersCommand, HandlePostTransfersCommand, HandlePutTransfersCommand, HandlePutTransfersErrorCommand, } from '@core/inbound/domain';
import { ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopHeaders, FspiopSettings, TransfersIDPatchResponse, TransfersIDPutResponse, TransfersPostRequest, } from '@shared/fspiop';
import { MdcContext } from '@shared/foundation';
import {InboundRepresentation} from './representation';
import {InboundRequestLogger} from './inbound-request-logger';

@Controller('transfers')
export class TransfersController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(TransfersController.name);

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
        const header = TransfersController.headerValue(value).trim();
        return header.length > 0 ? header : null;
    }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    async postTransfers(
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: TransfersPostRequest,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'POST /transfers', request);
        const mappedRequest = await this.mapPostTransfers(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: mappedRequest.transferId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Post Transfer Request for TransferId ${mappedRequest.transferId} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = TransfersController.optionalHeaderValue(traceparentHeader);
                const payerFsp = TransfersController.headerValue(sourceHeader);
                const payeeFsp = TransfersController.headerValue(destinationHeader);

                return new HandlePostTransfersCommand(
                    new HandlePostTransfersCommand.Input(correlationId, payerFsp, payeeFsp, mappedRequest),
                );
            });
        });
    }

    @Patch(':transferId')
    @HttpCode(HttpStatus.OK)
    async patchTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() response: TransfersIDPatchResponse,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PATCH /transfers', response);
        const mappedResponse = await this.mapPatchTransfers(contentTypeHeader, response);

        MdcContext.run({[MdcContext.TRANSFER_ID]: transferId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Patch Transfer Request for TransferId ${transferId} : ${JSON.stringify(mappedResponse)}`,
                );
                const correlationId = TransfersController.optionalHeaderValue(traceparentHeader);
                const payerFsp = TransfersController.headerValue(sourceHeader);
                const payeeFsp = TransfersController.headerValue(destinationHeader);

                return new HandlePatchTransfersCommand(
                    new HandlePatchTransfersCommand.Input(correlationId, payerFsp, payeeFsp, transferId, mappedResponse),
                );
            });
        });
    }

    @Put(':transferId/error')
    @HttpCode(HttpStatus.OK)
    async putTransfersError(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /transfers/error', request);
        const mappedRequest = await this.mapPutTransfersError(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: transferId}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Put Transfer Error Request for TransferId ${transferId} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = TransfersController.optionalHeaderValue(traceparentHeader);
                const payerFsp = TransfersController.headerValue(destinationHeader);
                const payeeFsp = TransfersController.headerValue(sourceHeader);
                const error = TransfersController.toErrorInformationObject(mappedRequest);

                return new HandlePutTransfersErrorCommand(
                    new HandlePutTransfersErrorCommand.Input(
                        correlationId,
                        payerFsp,
                        payeeFsp,
                        transferId,
                        error,
                    ),
                );
            });
        });
    }

    @Put(':transferId')
    @HttpCode(HttpStatus.OK)
    async putTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: TransfersIDPutResponse,
    ): Promise<void> {

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /transfers', request);
        const mappedRequest = await this.mapPutTransfers(contentTypeHeader, request);

        MdcContext.run({[MdcContext.TRANSFER_ID]: transferId}, () => {
            this.dispatch(() => {
                const correlationId = TransfersController.optionalHeaderValue(traceparentHeader);
                const payerFsp = TransfersController.headerValue(destinationHeader);
                const payeeFsp = TransfersController.headerValue(sourceHeader);

                return new HandlePutTransfersCommand(
                    new HandlePutTransfersCommand.Input(
                        correlationId,
                        payerFsp,
                        payeeFsp,
                        transferId,
                        mappedRequest,
                    ),
                );
            });
        });
    }

    private async mapPostTransfers(contentType: string | string[] | undefined, request: TransfersPostRequest): Promise<TransfersPostRequest> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await TransfersController.iso20022Transformer()).isoPostTransfersToFspiop(request) as TransfersPostRequest
            : request;
    }

    private async mapPatchTransfers(contentType: string | string[] | undefined, response: TransfersIDPatchResponse): Promise<TransfersIDPatchResponse> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await TransfersController.iso20022Transformer()).isoPatchTransfersToFspiop(response) as TransfersIDPatchResponse
            : response;
    }

    private async mapPutTransfers(contentType: string | string[] | undefined, request: TransfersIDPutResponse): Promise<TransfersIDPutResponse> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await TransfersController.iso20022Transformer()).isoPutTransfersToFspiop(request) as TransfersIDPutResponse
            : request;
    }

    private async mapPutTransfersError(
        contentType: string | string[] | undefined,
        request: ErrorInformationResponse | undefined,
    ): Promise<ErrorInformationResponse | undefined> {
        return request != null && InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await TransfersController.iso20022Transformer()).isoPutTransfersErrorToFspiop(request) as ErrorInformationResponse
            : request;
    }

    private static toErrorInformationObject(response: ErrorInformationResponse | undefined): ErrorInformationObject {
        return {
            errorInformation: response?.errorInformation ?? TransfersController.FALLBACK_ERROR.errorInformation,
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
