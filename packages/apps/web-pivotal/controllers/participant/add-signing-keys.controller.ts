import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {AddSigningKeysCommand} from '@core/participant/domain';

export class AddSigningKeysRequest {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    jwsPublicKey!: string;

    @IsString()
    @IsNotEmpty()
    jwsPrivateKey!: string;
}

@Controller('participant')
export class AddSigningKeysController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Post('signing-keys')
    @RequiresPermission(PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE)
    async addSigningKeys(
        @Body() request: AddSigningKeysRequest,
    ): Promise<AddSigningKeysCommand.Output> {
        return this.commandBus.execute(
            new AddSigningKeysCommand(
                new AddSigningKeysCommand.Input(
                    request.name,
                    request.jwsPublicKey,
                    request.jwsPrivateKey,
                ),
            ),
        );
    }
}
