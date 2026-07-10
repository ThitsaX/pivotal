// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class Limit {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: Number})
    value!: number;
}
