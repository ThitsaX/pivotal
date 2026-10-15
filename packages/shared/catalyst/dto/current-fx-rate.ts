// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class CurrentFxRate {
    @ApiProperty({type: String})
    baseCurrency!: string;

    @ApiProperty({type: String})
    quoteCurrency!: string;

    @ApiProperty({type: Number})
    rate!: number;

    @ApiProperty({type: String, format: 'date-time'})
    effectiveFrom!: string;

    @ApiProperty({type: String, format: 'date-time'})
    updatedAt!: string;
}
