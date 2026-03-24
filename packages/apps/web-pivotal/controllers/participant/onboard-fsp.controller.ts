import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {OnboardFspCommand} from '@core/participant/domain';
import {FspiopCurrency} from '@shared/fspiop';

export class OnboardFspRequest {

    name!: string;

    currencies!: FspiopCurrency[];

    endpoint!: string;

    jwsPublicKey!: string;

    jwsPrivateKey!: string;

    accessPublicKey!: string;
}

@Controller('participant')
export class OnboardFspController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('onboard')
    async onboardFsp(
        @Body() request: OnboardFspRequest,
    ): Promise<OnboardFspCommand.Output> {
        return this.commandBus.execute(
            new OnboardFspCommand(
                new OnboardFspCommand.Input(
                    request.name,
                    request.currencies,
                    request.endpoint,
                    request.jwsPublicKey,
                    request.jwsPrivateKey,
                    request.accessPublicKey,
                ),
            ),
        );
    }
}
