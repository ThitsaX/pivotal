// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class PostParticipantsNameEndpointsRequest {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: String})
    value!: string;
}
