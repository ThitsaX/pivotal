import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {AddSigningKeysCommand} from '@core/participant/domain';

export class AddHubSigningKeysRequest {

    jwsPublicKey!: string;

    jwsPrivateKey!: string;
}

@Controller('hub')
export class AddHubSigningKeysController {

    private static readonly HUB_NAME = 'hub';

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('signing-keys')
    async addHubSigningKeys(
        @Body() request: AddHubSigningKeysRequest,
    ): Promise<AddSigningKeysCommand.Output> {
        return this.commandBus.execute(
            new AddSigningKeysCommand(
                new AddSigningKeysCommand.Input(
                    AddHubSigningKeysController.HUB_NAME,
                    request.jwsPublicKey,
                    request.jwsPrivateKey,
                ),
            ),
        );
    }
}
