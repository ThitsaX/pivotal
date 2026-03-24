import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AddHubCurrencyCommand} from '@core/participant/domain';
import {FspiopCurrency} from '@shared/fspiop';

export class AddHubCurrencyRequest {

    currency!: FspiopCurrency;
}

@Controller('hub')
export class AddHubCurrencyController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('currency')
    async addHubCurrency(
        @Body() request: AddHubCurrencyRequest,
    ): Promise<AddHubCurrencyCommand.Output> {
        return this.commandBus.execute(
            new AddHubCurrencyCommand(
                new AddHubCurrencyCommand.Input(
                    request.currency,
                ),
            ),
        );
    }
}
