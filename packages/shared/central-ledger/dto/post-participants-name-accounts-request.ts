import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';

export class PostParticipantsNameAccountsRequest {

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: String})
    type!: string;
}
