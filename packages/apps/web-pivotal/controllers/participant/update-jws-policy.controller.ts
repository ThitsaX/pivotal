// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Body, Controller, Get, Inject, Put, Query} from '@nestjs/common';
import {CommandBus, QueryBus} from '@nestjs/cqrs';
import {IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {GetJwsPolicyQuery, UpdateJwsPolicyCommand} from '@core/participant/domain';
import {FspiopVerifyMode} from '@shared/fspiop';

export class UpdateJwsPolicyRequest {

    @IsString()
    @IsNotEmpty()
    fspId!: string;

    /** Omitted leaves the current setting; the two switches move independently. */
    @IsOptional()
    @IsBoolean()
    jwsSignEnabled?: boolean;

    @IsOptional()
    @IsEnum(FspiopVerifyMode)
    jwsVerifyMode?: FspiopVerifyMode;
}

/**
 * Moves a participant's JWS switches after provisioning.
 *
 * Onboarding leaves signing off and trust-manager turns it on once the key is registered, so this
 * is for what comes later: suspending a tenant, tightening verification as peers adopt signing, or
 * enabling one whose publication was resolved by hand.
 *
 * No key material passes through here, which is the point — the switches are operational, the keys
 * are not something an operator handles.
 */
@Controller('participant')
export class UpdateJwsPolicyController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    /**
     * The current switches, so a screen can show them before an operator changes one. Gated on
     * the update permission: reading them is only useful to someone who can change them.
     */
    @Get('jws-policy')
    @RequiresPermission(PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE)
    async getJwsPolicy(
        @Query('fspId') fspId: string,
    ): Promise<GetJwsPolicyQuery.Output> {
        return this.queryBus.execute(
            new GetJwsPolicyQuery(new GetJwsPolicyQuery.Input(fspId ?? '')),
        );
    }

    @Put('jws-policy')
    @RequiresPermission(PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE)
    async updateJwsPolicy(
        @Body() request: UpdateJwsPolicyRequest,
    ): Promise<UpdateJwsPolicyCommand.Output> {
        return this.commandBus.execute(
            new UpdateJwsPolicyCommand(
                new UpdateJwsPolicyCommand.Input(
                    request.fspId,
                    request.jwsSignEnabled,
                    request.jwsVerifyMode,
                ),
            ),
        );
    }
}
