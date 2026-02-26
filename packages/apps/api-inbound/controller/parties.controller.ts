import {Controller, Get, Param, Res} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {HandleGetPartiesCommand} from '@core/inbound/domain';
import {PartyIdType} from '@shared/fspiop';
import {Response} from 'express';

@Controller('parties')
export class PartiesController {
    constructor(private readonly commandBus: CommandBus) {
    }

    @Get(':type/:id')
    async getParties(
        @Param('type') type: string,
        @Param('id') id: string,
        @Res() res: Response,
    ): Promise<void> {

        res.status(202).send();

        const partyIdType = type.toUpperCase() as PartyIdType;

        void this.commandBus.execute(new HandleGetPartiesCommand(new HandleGetPartiesCommand.Input(partyIdType, id)));
    }
}
