import {ApiProperty} from '@nestjs/swagger';

export class ParticipantIsActive {

    @ApiProperty({type: Boolean})
    isActive!: boolean;
}
