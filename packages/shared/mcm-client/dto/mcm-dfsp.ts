// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class McmDfsp {

    /** The DFSP's identifier. MCM returns it as `id` on `GET /dfsps`, though it is posted as `dfspId`. */
    @ApiProperty({type: String})
    id!: string;

    /** Not returned by `GET /dfsps`; kept for any response that does use the posted name. */
    @ApiProperty({type: String, required: false})
    dfspId?: string;

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({type: String, required: false})
    monetaryZoneId?: string;

    @ApiProperty({type: Boolean, required: false})
    isProxy?: boolean;
}
