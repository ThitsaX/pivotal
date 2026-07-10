// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class CalculateFeeInput {

    @ApiProperty({type: String, required: false})
    amount?: string;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: String, required: false})
    scenario?: string;
}
