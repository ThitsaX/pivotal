// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ApiProperty} from '@nestjs/swagger';

export class LedgerAccountType {

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({type: String})
    description!: string;

    @ApiProperty({type: Boolean})
    isActive!: boolean;

    @ApiProperty({type: Boolean})
    isSettleable!: boolean;
}
