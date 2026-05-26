import {ApiProperty} from '@nestjs/swagger';

export class PostParticipantsNameEndpointsRequest {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: String})
    value!: string;
}
