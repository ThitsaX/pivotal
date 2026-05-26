import {ApiProperty} from '@nestjs/swagger';

export class Limit {

    @ApiProperty({type: String})
    type!: string;

    @ApiProperty({type: Number})
    value!: number;
}
