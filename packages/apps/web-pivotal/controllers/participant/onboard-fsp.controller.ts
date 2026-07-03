// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {OnboardFspCommand} from '@core/participant/domain';
import {Currency, FspiopCurrency} from '@shared/fspiop';

export class OnboardFspRequest {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(Currency, {each: true})
    currencies!: FspiopCurrency[];

    @IsString()
    @IsNotEmpty()
    endpoint!: string;

    @IsOptional()
    @IsString()
    jwsPublicKey?: string;

    @IsOptional()
    @IsString()
    jwsPrivateKey?: string;

    @IsString()
    @IsNotEmpty()
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
    @RequiresPermission(PermissionKey.PARTICIPANT_ONBOARD)
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
