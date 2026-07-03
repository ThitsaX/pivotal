// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min} from 'class-validator';

export class MenuCreateDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    @Matches(/^[a-z0-9-]+$/, {message: 'menuKey must be lowercase letters, digits, and hyphens only.'})
    menuKey!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    groupLabel!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    label!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    route!: string;

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
}
