// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {AddSigningKeysCommand} from '@core/participant/domain';

export class AddHubSigningKeysRequest {

    @IsString()
    @IsNotEmpty()
    jwsPublicKey!: string;

    @IsString()
    @IsNotEmpty()
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
    @RequiresPermission(PermissionKey.HUB_SIGNING_KEYS_UPDATE)
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
