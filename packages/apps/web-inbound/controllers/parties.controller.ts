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
    PartiesTypeIDPutResponse,
    PartyIdType,
} from '@shared/fspiop';

@Controller('parties')
export class PartiesController {

    private static readonly FALLBACK_ERROR = FspiopErrors.INTERNAL_SERVER_ERROR.toErrorObject();
    private readonly logger = new Logger(PartiesController.name);

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
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
        this.dispatch(() => {
            this.logger.log(
                `Get Party Request for idValue ${id}`,
            );
            const correlationId = PartiesController.optionalHeaderValue(traceparentHeader);
            const payerFsp = PartiesController.headerValue(sourceHeader);
            const payeeFsp = PartiesController.headerValue(destinationHeader);

            return new HandleGetPartiesCommand(
                new HandleGetPartiesCommand.Input(correlationId, payerFsp, payeeFsp, type, id, subId ?? null),
            );
        });
    }

    @Put(':type/:id{/:subId}/error')
    @HttpCode(HttpStatus.ACCEPTED)
    putPartiesError(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): void {
        this.dispatch(() => {
            this.logger.log(
                `Put Party Error Request for idValue ${id} : ${JSON.stringify(request)}`,
            );
            const correlationId = PartiesController.optionalHeaderValue(traceparentHeader);
            const payerFsp = PartiesController.headerValue(destinationHeader);
            const payeeFsp = PartiesController.headerValue(sourceHeader);
            const error = PartiesController.toErrorInformationObject(request);

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
    }

    @Put(':type/:id{/:subId}')
    @HttpCode(HttpStatus.ACCEPTED)
    putParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.TRACE_PARENT) traceparentHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: PartiesTypeIDPutResponse,
    ): void {
        this.dispatch(() => {
            this.logger.log(
                `Put Party Request for idValue ${id} : ${JSON.stringify(request)}`,
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
                    request,
                ),
            );
        });
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
