import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class CentralLedgerAccount {

    @ApiProperty({type: Number})
    id!: number;

    @ApiProperty({type: String})
    ledgerAccountType!: string;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: Boolean, required: false})
    isActive?: boolean;

    @ApiProperty({type: String, required: false})
    createdDate?: string | null;

    @ApiProperty({type: String, required: false})
    createdBy?: string | null;
}
