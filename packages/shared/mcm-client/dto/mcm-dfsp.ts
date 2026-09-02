// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class McmDfsp {

    @ApiProperty({type: String})
    dfspId!: string;

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({type: String, required: false})
    monetaryZoneId?: string;

    @ApiProperty({type: Boolean, required: false})
    isProxy?: boolean;
}
