// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';
import {FeeCalculationResult} from './fee-calculation-result';

export class CalculateFeeByFeePolicyIdOutput {

    @ApiProperty({type: () => FeeCalculationResult, required: false})
    feeCalculationResultData?: FeeCalculationResult;
}
