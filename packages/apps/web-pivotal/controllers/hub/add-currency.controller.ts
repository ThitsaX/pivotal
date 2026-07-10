// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Body, Controller, Inject, Post} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsEnum} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {AddHubCurrencyCommand} from '@core/participant/domain';
import {Currency, FspiopCurrency} from '@shared/fspiop';

export class AddHubCurrencyRequest {

    @IsEnum(Currency)
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
    @RequiresPermission(PermissionKey.HUB_CURRENCY_ADD)
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
