import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AddFspCurrencyCommand} from '@core/participant/domain';
import {FspiopCurrency} from '@shared/fspiop';

export class AddFspCurrencyRequest {

    name!: string;

    currency!: FspiopCurrency;
}

@Controller('participant')
export class AddFspCurrencyController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('currency')
    async addFspCurrency(
        @Body() request: AddFspCurrencyRequest,
    ): Promise<AddFspCurrencyCommand.Output> {
        return this.commandBus.execute(
            new AddFspCurrencyCommand(
                new AddFspCurrencyCommand.Input(
                    request.name,
                    request.currency,
                ),
            ),
        );
    }
}
