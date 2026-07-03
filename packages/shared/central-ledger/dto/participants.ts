// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {ExtensionList} from '@shared/fspiop';
import {ParticipantFundsAction} from './central-ledger-types';
import {NoAmountProvided} from './no-amount-provided';

export class Participants {

    @ApiProperty({type: String})
    transferId!: string;

    @ApiProperty({type: String})
    externalReference!: string;

    @ApiProperty({enum: ParticipantFundsAction, enumName: 'ParticipantFundsAction'})
    action!: ParticipantFundsAction;

    @ApiProperty({type: String})
    reason!: string;

    @ApiProperty({type: () => NoAmountProvided})
    amount!: NoAmountProvided;

    @ApiProperty({type: () => ExtensionList, required: false})
    extensionList?: ExtensionList;
}
