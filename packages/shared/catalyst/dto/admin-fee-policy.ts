// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {FeePolicy} from './fee-policy';

export class FeePolicyTemplate {

    @ApiProperty({type: () => FeePolicy.Formula, isArray: true, required: false})
    formulas?: Array<FeePolicy.Formula>;

    @ApiProperty({type: String, required: false})
    name?: string;

    @ApiProperty({type: () => FeePolicy.Split, isArray: true, required: false})
    splits?: Array<FeePolicy.Split>;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    transactionCurrency?: Currency;
}

export class CreateFeePolicyInput extends FeePolicyTemplate {}

export class CreateFeePolicyOutput {

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;
}

export class TemplatizeFeePolicyInput {

    @ApiProperty({type: String, required: false})
    feePolicyId?: string;
}

export class FeePolicySummary {

    @ApiProperty({type: String, required: false})
    id?: string;

    @ApiProperty({type: String, required: false})
    name?: string;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    transactionCurrency?: Currency;
}
