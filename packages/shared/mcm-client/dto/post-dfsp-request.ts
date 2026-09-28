// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class PostDfspRequest {

    @ApiProperty({type: String})
    dfspId!: string;

    @ApiProperty({type: String})
    name!: string;

    /**
     * Required by MCM despite being absent from its swagger and from every design
     * document here. Omitting it fails with `ValidationError: email is required`.
     */
    @ApiProperty({type: String})
    email!: string;

    @ApiProperty({type: String, required: false})
    monetaryZoneId?: string;
}
