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
