// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {FeeCalculationResult} from './fee-calculation-result';

export class CalculateFeeOutput {

    @ApiProperty({type: () => FeeCalculationResult, required: false})
    feeCalculationResultData?: FeeCalculationResult;
}
