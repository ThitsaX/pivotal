import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class NoAmountProvided {

    @ApiProperty({type: Number})
    amount!: number;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;
}
