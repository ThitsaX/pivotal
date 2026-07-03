// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';

export class CalculateFeeByFeePolicyIdInput {

    @ApiProperty({type: String, required: false})
    amount?: string;

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;
}
