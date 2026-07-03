// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Body, Controller, Inject, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {UpdateAccessKeyCommand} from '@core/participant/domain';

export class UpdateAccessKeyRequest {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    accessPublicKey!: string;
}

@Controller('participant')
export class UpdateAccessKeyController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    @Put('access-key')
    @RequiresPermission(PermissionKey.PARTICIPANT_ACCESS_KEY_UPDATE)
    async updateAccessKey(
        @Body() request: UpdateAccessKeyRequest,
    ): Promise<UpdateAccessKeyCommand.Output> {
        return this.commandBus.execute(
            new UpdateAccessKeyCommand(
                new UpdateAccessKeyCommand.Input(
                    request.name,
                    request.accessPublicKey,
                ),
            ),
        );
    }
}
