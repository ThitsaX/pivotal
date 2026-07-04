// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min} from 'class-validator';

export class MenuUpdateDto {

    @IsOptional()
    @IsString()
    @MaxLength(64)
    groupLabel?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    label?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    route?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    icon?: string | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    parentId?: string | null;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    // Declared so it survives the global whitelist filter; the controller rejects it
    // with ADMIN_MENU_IMMUTABLE_FIELD (AC-11.3) rather than the generic class-validator
    // "property should not exist" message.
    @IsOptional()
    menuKey?: string;
}
