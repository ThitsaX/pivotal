// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Inject,
    Logger,
    Param,
    Put,
} from '@nestjs/common';
import { CommandBus, ICommand } from '@nestjs/cqrs';
import {
    HandleGetPartiesCommand,
    HandlePutPartiesCommand,
    HandlePutPartiesErrorCommand,
} from '@core/inbound/domain';
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopErrors,
    FspiopHeaders,
    FspiopSettings,
    PartiesTypeIDPutResponse,
    PartyIdType,
} from '@shared/fspiop';
import { MdcContext } from '@shared/foundation';
import {InboundRepresentation} from './representation';
import {InboundRequestLogger} from './inbound-request-logger';

@Controller('parties')
export class PartiesController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(PartiesController.name);

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

    @Get(':type/:id{/:subId}')
    @HttpCode(HttpStatus.ACCEPTED)
    getParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
    ): void {
        const idValue = subId ? `${id} ${subId}` : id;
        MdcContext.run({[MdcContext.ID_VALUE]: idValue}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Get Party Request for idValue ${idValue}`,
                );
                const correlationId = PartiesController.optionalHeaderValue(traceparentHeader);
                const payerFsp = PartiesController.headerValue(sourceHeader);
                const payeeFsp = PartiesController.headerValue(destinationHeader);

                return new HandleGetPartiesCommand(
                    new HandleGetPartiesCommand.Input(correlationId, payerFsp, payeeFsp, type, id, subId ?? null),
                );
            });
        });
    }

    @Put(':type/:id{/:subId}/error')
    @HttpCode(HttpStatus.OK)
    async putPartiesError(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): Promise<void> {
        const idValue = subId ? `${id} ${subId}` : id;

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /parties/error', request);
        const mappedRequest = await this.mapPutPartiesError(contentTypeHeader, request);

        MdcContext.run({[MdcContext.ID_VALUE]: idValue}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Put Party Error Request for idValue ${idValue} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = PartiesController.optionalHeaderValue(traceparentHeader);
                const payerFsp = PartiesController.headerValue(destinationHeader);
                const payeeFsp = PartiesController.headerValue(sourceHeader);
                const error = PartiesController.toErrorInformationObject(mappedRequest);

                return new HandlePutPartiesErrorCommand(
                    new HandlePutPartiesErrorCommand.Input(
                        correlationId,
                        payerFsp,
                        payeeFsp,
                        type,
                        id,
                        subId ?? null,
                        error,
                    ),
                );
            });
        });
    }

    @Put(':type/:id{/:subId}')
    @HttpCode(HttpStatus.OK)
    async putParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.CONTENT_TYPE) contentTypeHeader: string | string[] | undefined,
        @Body() request: PartiesTypeIDPutResponse,
    ): Promise<void> {
        const idValue = subId ? `${id} ${subId}` : id;

        InboundRequestLogger.logBodyBeforeRepresentationConversion(this.logger, 'PUT /parties', request);
        const mappedRequest = await this.mapPutParties(contentTypeHeader, request);

        MdcContext.run({[MdcContext.ID_VALUE]: idValue}, () => {
            this.dispatch(() => {
                this.logger.log(
                    `Put Party Request for idValue ${idValue} : ${JSON.stringify(mappedRequest)}`,
                );
                const correlationId = PartiesController.optionalHeaderValue(traceparentHeader);
                const payerFsp = PartiesController.headerValue(destinationHeader);
                const payeeFsp = PartiesController.headerValue(sourceHeader);

                return new HandlePutPartiesCommand(
                    new HandlePutPartiesCommand.Input(
                        correlationId,
                        payerFsp,
                        payeeFsp,
                        type,
                        id,
                        subId ?? null,
                        mappedRequest,
                    ),
                );
            });
        });
    }

    private async mapPutParties(
        contentType: string | string[] | undefined,
        request: PartiesTypeIDPutResponse,
    ): Promise<PartiesTypeIDPutResponse> {
        return InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await PartiesController.iso20022Transformer()).isoPutPartiesToFspiop(request) as PartiesTypeIDPutResponse
            : request;
    }

    private async mapPutPartiesError(
        contentType: string | string[] | undefined,
        request: ErrorInformationResponse | undefined,
    ): Promise<ErrorInformationResponse | undefined> {
        return request != null && InboundRepresentation.isIso20022(this.settings, contentType)
            ? await (await PartiesController.iso20022Transformer()).isoPutPartiesErrorToFspiop(request) as ErrorInformationResponse
            : request;
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
        const header = PartiesController.headerValue(value).trim();
        return header.length > 0 ? header : null;
    }

    private static toErrorInformationObject(response: ErrorInformationResponse | undefined): ErrorInformationObject {
        return {
            errorInformation: response?.errorInformation ?? PartiesController.FALLBACK_ERROR.errorInformation,
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
