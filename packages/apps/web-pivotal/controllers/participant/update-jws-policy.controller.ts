// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Body, Controller, Inject, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {UpdateJwsPolicyCommand} from '@core/participant/domain';
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
    ) {
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
