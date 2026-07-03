// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsEnum, IsNotEmpty, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {AddFspCurrencyCommand} from '@core/participant/domain';
import {Currency, FspiopCurrency} from '@shared/fspiop';

export class AddFspCurrencyRequest {

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsEnum(Currency)
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
    @RequiresPermission(PermissionKey.PARTICIPANT_CURRENCY_ADD)
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
