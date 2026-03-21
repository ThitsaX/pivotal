import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {ParticipantLimit} from './participant-limit';

export class PutParticipantsNameLimitsRequest {

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: () => ParticipantLimit})
    limit!: ParticipantLimit;
}
