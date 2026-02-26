import {Controller, Get, Param} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {DoLookupCommand} from '@core/outbound/domain';
import {PartyIdType} from '@shared/fspiop';

@Controller('parties')
export class LookupController {

    constructor(private readonly commandBus: CommandBus) {
    }

    @Get(':type/:id/:subId')
    async getParties(
        @Param('type') type: string,
        @Param('id') id: string,
        @Param('subId') subId: string,
    ): Promise<DoLookupCommand.Output> {

        const partyIdType = type.toUpperCase() as PartyIdType;

        return this.commandBus.execute<DoLookupCommand, DoLookupCommand.Output>(
            new DoLookupCommand(new DoLookupCommand.Input(partyIdType, id, subId)),
        );
    }
}
