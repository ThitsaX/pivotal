import {Body, Controller, Headers, HttpCode, HttpStatus, Param, Patch, Post, Put,} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {HandlePatchTransfersCommand, HandlePostTransfersCommand, HandlePutTransfersCommand, HandlePutTransfersErrorCommand,} from '@core/inbound/domain';
import {ErrorInformationObject, FspiopHeaders, TransfersIDPatchResponse, TransfersIDPutResponse, TransfersPostRequest,} from '@shared/fspiop';

@Controller('transfers')
export class TransfersController {

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
    async postTransfers(@Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
                        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
                        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
                        @Body() request: TransfersPostRequest): Promise<void> {

        const payerFsp = TransfersController.headerValue(destinationHeader);
        const payeeFsp = TransfersController.headerValue(sourceHeader);
        const correlationId = TransfersController.headerValue(correlationIdHeader);

        await this.commandBus.execute(
            new HandlePostTransfersCommand(
                new HandlePostTransfersCommand.Input(payerFsp, payeeFsp, correlationId, request),
            ),
        );
    }

    @Patch(':transferId')
    @HttpCode(HttpStatus.ACCEPTED)
    async patchTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() response: TransfersIDPatchResponse,
    ): Promise<void> {

        const payerFsp = TransfersController.headerValue(destinationHeader);
        const payeeFsp = TransfersController.headerValue(sourceHeader);
        const correlationId = TransfersController.headerValue(correlationIdHeader);

        await this.commandBus.execute(
            new HandlePatchTransfersCommand(
                new HandlePatchTransfersCommand.Input(payerFsp, payeeFsp, correlationId, transferId, response),
            ),
        );
    }

    @Put(':transferId')
    @HttpCode(HttpStatus.OK)
    async putTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() request: TransfersIDPutResponse,
    ): Promise<void> {
        const payerFsp = TransfersController.headerValue(destinationHeader);
        const payeeFsp = TransfersController.headerValue(sourceHeader);
        const correlationId = TransfersController.headerValue(correlationIdHeader, transferId);

        await this.commandBus.execute(
            new HandlePutTransfersCommand(
                new HandlePutTransfersCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    transferId,
                    request,
                ),
            ),
        );
    }

    @Put(':transferId/error')
    @HttpCode(HttpStatus.OK)
    async putTransfersError(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() request: ErrorInformationObject,
    ): Promise<void> {
        const payerFsp = TransfersController.headerValue(destinationHeader);
        const payeeFsp = TransfersController.headerValue(sourceHeader);
        const correlationId = TransfersController.headerValue(correlationIdHeader, transferId);

        await this.commandBus.execute(
            new HandlePutTransfersErrorCommand(
                new HandlePutTransfersErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    transferId,
                    request,
                ),
            ),
        );
    }
}
