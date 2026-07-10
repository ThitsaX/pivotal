// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {IsBoolean, IsOptional, IsString, MaxLength} from 'class-validator';

export class UserUpdateDto {

    @IsOptional()
    @IsString()
    @MaxLength(64)
    roleId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    fspId?: string | null;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
