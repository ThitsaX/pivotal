// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';

export class ParticipantLimit {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: Number})
    value!: number;

    @ApiProperty({type: Number})
    alarmPercentage!: number;
}
