import {ApiProperty} from '@nestjs/swagger';
import {Currency} from '@shared/fspiop';
import {FeeFormulaRounding, FeeValueType} from './fee-types';

export class FeeCalculationResult {

    @ApiProperty({type: () => FeeCalculationResult.FeePolicy, required: false})
    feePolicy?: FeeCalculationResult.FeePolicy | null;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    feeCurrency?: Currency;

    @ApiProperty({type: String, required: false})
    totalFeeAmount?: string;

    @ApiProperty({type: String, required: false})
    transactionAmount?: string;

    @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
    transactionCurrency?: Currency;

    @ApiProperty({type: Object, required: false})
    feeSplits?: { [key: string]: FeeCalculationResult.FeeSplit; };
}

export namespace FeeCalculationResult {

    export class FeePolicy {

        @ApiProperty({type: String, required: false})
        feePolicyId?: string;

        @ApiProperty({type: () => FeeCalculationResult.FeePolicyFormula, isArray: true, required: false})
        formula?: Array<FeeCalculationResult.FeePolicyFormula>;

        @ApiProperty({type: String, required: false})
        scenario?: string;

        @ApiProperty({type: Object, required: false})
        splits?: { [key: string]: FeeCalculationResult.FeePolicySplit; };

        @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
        transactionCurrency?: Currency;
    }

    export class FeePolicyFormula {

        @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
        currency?: Currency;

        @ApiProperty({type: String, required: false})
        gte?: string;

        @ApiProperty({enum: FeeFormulaRounding, enumName: 'FeeFormulaRounding', required: false})
        rounding?: FeeFormulaRounding;

        @ApiProperty({enum: FeeValueType, enumName: 'FeeValueType', required: false})
        type?: FeeValueType;

        @ApiProperty({type: String, required: false})
        value?: string;
    }

    export class FeePolicySplit {

        @ApiProperty({enum: FeeValueType, enumName: 'FeeValueType', required: false})
        type?: FeeValueType;

        @ApiProperty({type: String, required: false})
        value?: string;
    }

    export class FeeSplit {

        @ApiProperty({type: String, required: false})
        amount?: string;

        @ApiProperty({enum: Currency, enumName: 'Currency', required: false})
        currency?: Currency;
    }
}
