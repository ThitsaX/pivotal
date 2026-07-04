// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {
    SettlementModelDelay,
    SettlementModelGranularity,
    SettlementModelInterchange,
    SettlementModelLedgerAccountType,
} from './central-ledger-types';

export class SettlementModel {

    @ApiProperty({type: String})
    name!: string;

    @ApiProperty({enum: SettlementModelGranularity, enumName: 'SettlementModelGranularity'})
    settlementGranularity!: SettlementModelGranularity;

    @ApiProperty({enum: SettlementModelInterchange, enumName: 'SettlementModelInterchange'})
    settlementInterchange!: SettlementModelInterchange;

    @ApiProperty({enum: SettlementModelDelay, enumName: 'SettlementModelDelay'})
    settlementDelay!: SettlementModelDelay;

    @ApiProperty({enum: Currency, enumName: 'Currency'})
    currency!: Currency;

    @ApiProperty({type: Boolean})
    requireLiquidityCheck!: boolean;

    @ApiProperty({enum: SettlementModelLedgerAccountType, enumName: 'SettlementModelLedgerAccountType'})
    ledgerAccountType!: SettlementModelLedgerAccountType;

    @ApiProperty({type: String})
    settlementAccountType!: string;

    @ApiProperty({type: Boolean})
    autoPositionReset!: boolean;
}
