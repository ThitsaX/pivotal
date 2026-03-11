import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Inject,
    Param,
    Put,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
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

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Get(':type/:id')
    @Get(':type/:id/:subId')
    @HttpCode(HttpStatus.ACCEPTED)
    async getParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
    ): Promise<void> {
        const payerFsp = PartiesController.headerValue(sourceHeader);
        const payeeFsp = PartiesController.headerValue(destinationHeader);

        await this.commandBus.execute(
            new HandleGetPartiesCommand(
                new HandleGetPartiesCommand.Input(payerFsp, payeeFsp, type, id, subId ?? null),
            ),
        );
    }

    @Put(':type/:id')
    @Put(':type/:id/:subId')
    @HttpCode(HttpStatus.OK)
    async putParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: PartiesTypeIDPutResponse,
    ): Promise<void> {
        const payerFsp = PartiesController.headerValue(destinationHeader);
        const payeeFsp = PartiesController.headerValue(sourceHeader);

        await this.commandBus.execute(
            new HandlePutPartiesCommand(
                new HandlePutPartiesCommand.Input(
                    payerFsp,
                    payeeFsp,
                    type,
                    id,
                    subId ?? null,
                    request,
                ),
            ),
        );
    }

    @Put(':type/:id/error')
    @Put(':type/:id/:subId/error')
    @HttpCode(HttpStatus.OK)
    async putPartiesError(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
        @Param('subId') subId: string | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) sourceHeader: string | string[] | undefined,
        @Headers(FspiopHeaders.Names.FSPIOP_DESTINATION) destinationHeader: string | string[] | undefined,
        @Body() request: ErrorInformationResponse | undefined,
    ): Promise<void> {
        const payerFsp = PartiesController.headerValue(destinationHeader);
        const payeeFsp = PartiesController.headerValue(sourceHeader);
        const error = PartiesController.toErrorInformationObject(request);

        await this.commandBus.execute(
            new HandlePutPartiesErrorCommand(
                new HandlePutPartiesErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    type,
                    id,
                    subId ?? null,
                    error,
                ),
            ),
        );
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

    private static toErrorInformationObject(response: ErrorInformationResponse | undefined): ErrorInformationObject {
        return {
            errorInformation: response?.errorInformation ?? PartiesController.FALLBACK_ERROR.errorInformation,
        };
    }
}
