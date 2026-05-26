import {ApiProperty} from '@nestjs/swagger';
import {RecordFundsOutAction} from './central-ledger-types';

export class RecordFundsOut {

    @ApiProperty({enum: RecordFundsOutAction, enumName: 'RecordFundsOutAction', required: false})
    action?: RecordFundsOutAction;

    @ApiProperty({type: String})
    reason!: string;
}
