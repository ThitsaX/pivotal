// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class NoAmountProvided {

    @ApiProperty({type: Number})
    amount!: number;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;
}
