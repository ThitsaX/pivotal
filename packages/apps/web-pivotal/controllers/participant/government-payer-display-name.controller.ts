// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Body, Controller, Get, Inject, Put, Query} from '@nestjs/common';
import {CommandBus, QueryBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsString, ValidateIf} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {
    GetGovernmentPayerDisplayNameQuery,
    UpdateGovernmentPayerDisplayNameCommand,
} from '@core/participant/domain';

export class UpdateGovernmentPayerDisplayNameRequest {

    @IsString()
    @IsNotEmpty()
    fspId!: string;

    /** Null, or blank after trimming, clears the stored name. */
    @ValidateIf((_, value) => value !== null)
    @IsString()
    displayName!: string | null;
}

/**
 * The name a DFSP shows as the payer on government-to-person transfers when the sender left it
 * blank. There is no portal screen yet, so operators set it through this API.
 *
 * Reading is gated on the same permission as writing: the value is only useful to someone who
 * can change it.
 */
@Controller('participant')
export class GovernmentPayerDisplayNameController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get('government-payer-display-name')
    @RequiresPermission(PermissionKey.PARTICIPANT_PAYER_DISPLAY_NAME_UPDATE)
    async getGovernmentPayerDisplayName(
        @Query('fspId') fspId: string,
    ): Promise<GetGovernmentPayerDisplayNameQuery.Output> {
        return this.queryBus.execute(
            new GetGovernmentPayerDisplayNameQuery(
                new GetGovernmentPayerDisplayNameQuery.Input(fspId ?? ''),
            ),
        );
    }

    @Put('government-payer-display-name')
    @RequiresPermission(PermissionKey.PARTICIPANT_PAYER_DISPLAY_NAME_UPDATE)
    async updateGovernmentPayerDisplayName(
        @Body() request: UpdateGovernmentPayerDisplayNameRequest,
    ): Promise<UpdateGovernmentPayerDisplayNameCommand.Output> {
        return this.commandBus.execute(
            new UpdateGovernmentPayerDisplayNameCommand(
                new UpdateGovernmentPayerDisplayNameCommand.Input(
                    request.fspId,
                    request.displayName,
                ),
            ),
        );
    }
}
