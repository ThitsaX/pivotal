import {ApiProperty} from '@nestjs/swagger';
import {CentralLedgerAccount} from './central-ledger-account';

export class CentralLedgerParticipantLinks {

    @ApiProperty({type: String, required: false})
    self?: string;
}

export class CentralLedgerParticipant {

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({type: String, required: false})
    id?: string;

    @ApiProperty({type: String, required: false})
    created?: string;

    @ApiProperty({type: Boolean, required: false})
    isActive?: boolean;

    @ApiProperty({type: () => CentralLedgerParticipantLinks, required: false})
    links?: CentralLedgerParticipantLinks;

    @ApiProperty({type: () => CentralLedgerAccount, isArray: true, required: false})
    accounts?: Array<CentralLedgerAccount>;

    @ApiProperty({type: Boolean, required: false})
    isProxy?: boolean;
}
