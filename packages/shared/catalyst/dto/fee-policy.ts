// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {FeeFormulaRounding, FeeSplitRole, FeeValueType} from './fee-types';

export class FeePolicy {

    @ApiProperty({type: () => FeePolicy.FormulaSet, required: false})
    formulaSet?: FeePolicy.FormulaSet;

    @ApiProperty({type: String, required: false})
    id?: string;

    @ApiProperty({type: String, required: false})
    name?: string;

    @ApiProperty({type: () => FeePolicy.SplitSet, required: false})
    splitSet?: FeePolicy.SplitSet;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    transactionCurrency?: Currency;
}

export namespace FeePolicy {

    export class FormulaSet {

        @ApiProperty({type: () => FeePolicy.Formula, isArray: true, required: false})
        formulas?: Array<FeePolicy.Formula>;

        @ApiProperty({type: String, required: false})
        id?: string;
    }

    export class Formula {

        @ApiProperty({type: String, required: false})
        amountGte?: string;

        @ApiProperty({type: String, required: false})
        id?: string;

        @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
        outputCurrency?: Currency;

        @ApiProperty({enum: FeeFormulaRounding, enumName: 'FeeFormulaRounding', required: false})
        rounding?: FeeFormulaRounding;

        @ApiProperty({enum: FeeValueType, enumName: 'FeeValueType', required: false})
        type?: FeeValueType;

        @ApiProperty({type: String, required: false})
        value?: string;
    }

    export class SplitSet {

        @ApiProperty({type: String, required: false})
        id?: string;

        @ApiProperty({type: () => FeePolicy.Split, isArray: true, required: false})
        splits?: Array<FeePolicy.Split>;
    }

    export class Split {

        @ApiProperty({type: String, required: false})
        id?: string;

        @ApiProperty({enum: FeeSplitRole, enumName: 'FeeSplitRole', required: false})
        role?: FeeSplitRole;

        @ApiProperty({enum: FeeValueType, enumName: 'FeeValueType', required: false})
        type?: FeeValueType;

        @ApiProperty({type: String, required: false})
        value?: string;
    }
}
