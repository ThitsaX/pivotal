// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';

export class Limit {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: Number})
    value!: number;
}
