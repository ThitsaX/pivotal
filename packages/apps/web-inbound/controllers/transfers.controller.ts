import {Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Param, Patch, Post, Put,} from '@nestjs/common';
import {CommandBus, ICommand} from '@nestjs/cqrs';
import {HandlePatchTransfersCommand, HandlePostTransfersCommand, HandlePutTransfersCommand, HandlePutTransfersErrorCommand,} from '@core/inbound/domain';
import {ErrorInformationObject, ErrorInformationResponse, FspiopErrors, FspiopHeaders, TransfersIDPatchResponse, TransfersIDPutResponse, TransfersPostRequest,} from '@shared/fspiop';

@Controller('transfers')
export class TransfersController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(TransfersController.name);

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
    postTransfers(@Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
                  @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
                  @Body() request: TransfersPostRequest): void {
        this.dispatch(() => {
            const payerFsp = TransfersController.headerValue(sourceHeader);
            const payeeFsp = TransfersController.headerValue(destinationHeader);

            return new HandlePostTransfersCommand(
                new HandlePostTransfersCommand.Input(payerFsp, payeeFsp, request),
            );
        });
    }

    @Patch(':transferId')
    @HttpCode(HttpStatus.ACCEPTED)
    patchTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() response: TransfersIDPatchResponse,
    ): void {
        this.dispatch(() => {
            const payerFsp = TransfersController.headerValue(sourceHeader);
            const payeeFsp = TransfersController.headerValue(destinationHeader);

            return new HandlePatchTransfersCommand(
                new HandlePatchTransfersCommand.Input(payerFsp, payeeFsp, transferId, response),
            );
        });
    }

    @Put(':transferId')
    @HttpCode(HttpStatus.ACCEPTED)
    putTransfers(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: TransfersIDPutResponse,
    ): void {
        this.dispatch(() => {
            const payerFsp = TransfersController.headerValue(destinationHeader);
            const payeeFsp = TransfersController.headerValue(sourceHeader);

            return new HandlePutTransfersCommand(
                new HandlePutTransfersCommand.Input(
                    payerFsp,
                    payeeFsp,
                    transferId,
                    request,
                ),
            );
        });
    }

    @Put(':transferId/error')
    @HttpCode(HttpStatus.ACCEPTED)
    putTransfersError(
        @Param('transferId') transferId: string,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): void {
        this.dispatch(() => {
            const payerFsp = TransfersController.headerValue(destinationHeader);
            const payeeFsp = TransfersController.headerValue(sourceHeader);
            const error = TransfersController.toErrorInformationObject(request);

            return new HandlePutTransfersErrorCommand(
                new HandlePutTransfersErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    transferId,
                    error,
                ),
            );
        });
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
