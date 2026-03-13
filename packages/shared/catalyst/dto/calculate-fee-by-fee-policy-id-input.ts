import {ApiProperty} from '@nestjs/swagger';

export class CalculateFeeByFeePolicyIdInput {

    @ApiProperty({type: String, required: false})
    amount?: string;

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;
}
