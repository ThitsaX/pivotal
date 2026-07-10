// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ArrayUnique, IsArray, IsString, MaxLength} from 'class-validator';

export class RolePermissionsDto {

    @IsArray()
    @ArrayUnique()
    @IsString({each: true})
    @MaxLength(128, {each: true})
    permissionKeys!: string[];
}
