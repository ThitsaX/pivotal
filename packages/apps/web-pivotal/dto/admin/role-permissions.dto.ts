// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ArrayUnique, IsArray, IsString, MaxLength} from 'class-validator';

export class RolePermissionsDto {

    @IsArray()
    @ArrayUnique()
    @IsString({each: true})
    @MaxLength(128, {each: true})
    permissionKeys!: string[];
}
