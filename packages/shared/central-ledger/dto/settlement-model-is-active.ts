import {ApiProperty} from '@nestjs/swagger';

export class SettlementModelIsActive {

    @ApiProperty({type: Boolean})
    isActive!: boolean;
}
