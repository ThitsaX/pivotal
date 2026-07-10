// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {ParticipantLimit} from './participant-limit';

export class PutParticipantsNameLimitsRequest {

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    currency?: Currency;

    @ApiProperty({type: () => ParticipantLimit})
    limit!: ParticipantLimit;
}
