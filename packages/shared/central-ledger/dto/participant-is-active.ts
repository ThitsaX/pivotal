// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class ParticipantIsActive {

    @ApiProperty({type: Boolean})
    isActive!: boolean;
}
