import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
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
    FspiopHeaders,
    PartiesTypeIDPutResponse,
    PartyIdType,
} from '@shared/fspiop';

@Controller('parties')
export class PartiesController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Get(':type/:id')
    @Get(':type/:id/:subId')
    @HttpCode(HttpStatus.ACCEPTED)
    async getParties(
        @Param('type') type: PartyIdType,
        @Param('id') id: string,
    ): Promise<void> {
        await this.commandBus.execute(
            new HandleGetPartiesCommand(
                new HandleGetPartiesCommand.Input(type, id),
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
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() body: PartiesTypeIDPutResponse,
    ): Promise<void> {
        const payerFsp = PartiesController.headerValue(destinationHeader);
        const payeeFsp = PartiesController.headerValue(sourceHeader);
        const correlationId = PartiesController.headerValue(correlationIdHeader, id);

        await this.commandBus.execute(
            new HandlePutPartiesCommand(
                new HandlePutPartiesCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    type,
                    id,
                    subId ?? null,
                    body,
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
        @Headers('x-correlation-id') correlationIdHeader: string | string[] | undefined,
        @Body() body: ErrorInformationObject,
    ): Promise<void> {
        const payerFsp = PartiesController.headerValue(destinationHeader);
        const payeeFsp = PartiesController.headerValue(sourceHeader);
        const correlationId = PartiesController.headerValue(correlationIdHeader, id);

        await this.commandBus.execute(
            new HandlePutPartiesErrorCommand(
                new HandlePutPartiesErrorCommand.Input(
                    payerFsp,
                    payeeFsp,
                    correlationId,
                    type,
                    id,
                    subId ?? null,
                    body,
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
}
