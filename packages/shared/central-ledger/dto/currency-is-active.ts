import {ApiProperty} from '@nestjs/swagger';

export class CurrencyIsActive {

    @ApiProperty({type: Boolean})
    isActive!: boolean;
}
