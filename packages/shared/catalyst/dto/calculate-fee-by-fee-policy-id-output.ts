import {ApiProperty} from '@nestjs/swagger';
import {FeeCalculationResult} from './fee-calculation-result';

export class CalculateFeeByFeePolicyIdOutput {

    @ApiProperty({type: () => FeeCalculationResult, required: false})
    feeCalculationResultData?: FeeCalculationResult;
}
