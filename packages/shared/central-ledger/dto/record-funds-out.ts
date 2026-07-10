// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';
import {RecordFundsOutAction} from './central-ledger-types';

export class RecordFundsOut {

    @ApiProperty({enum: RecordFundsOutAction, enumName: 'RecordFundsOutAction', required: false})
    action?: RecordFundsOutAction;

    @ApiProperty({type: String})
    reason!: string;
}
