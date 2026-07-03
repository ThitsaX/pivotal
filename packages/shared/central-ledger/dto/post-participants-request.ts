// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class PostParticipantsRequest {

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: Boolean, required: false})
    isProxy?: boolean;
}
