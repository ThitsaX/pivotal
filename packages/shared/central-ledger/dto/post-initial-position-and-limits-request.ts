// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {Limit} from './limit';

export class PostInitialPositionAndLimitsRequest {

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: () => Limit})
    limit!: Limit;

    @ApiProperty({type: Number, required: false})
    initialPosition?: number;
}
