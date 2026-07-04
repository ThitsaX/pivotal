// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {IsIn, IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';
import {ROLE_SCOPES, RoleScope} from '@core/auth/domain';

export class RoleCreateDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    code!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    name!: string;

    @IsIn(ROLE_SCOPES as unknown as string[])
    scope!: RoleScope;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;
}
