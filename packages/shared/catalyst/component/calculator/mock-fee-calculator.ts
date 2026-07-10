// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Currency, FspiopCurrencies, FspiopMoney, Money} from '@shared/fspiop';
import {FeeCalculationResult} from '../../dto';
import {FeeCalculator} from '../fee-calculator';

export class MockFeeCalculator extends FeeCalculator {

    private static readonly FEE_DENOMINATOR = 100n;
    private static readonly PAYER_FEE_SHARE = 30n;
    private static readonly PAYEE_FEE_SHARE = 30n;
    private static readonly SHARE_DENOMINATOR = 100n;

    async calculate(scenario: string, amount: Money): Promise<FeeCalculationResult>;

    async calculate(policyId: bigint, amount: Money): Promise<FeeCalculationResult>;

    async calculate(scenarioOrPolicyId: string | bigint, amount: Money): Promise<FeeCalculationResult> {

        const currencyProfile = FspiopCurrencies.get(amount.currency);
        const scale = currencyProfile?.scale ?? 0;
        const amountMinor = FspiopMoney.serialize(amount.amount, scale);

        const totalFeeMinor = amountMinor / MockFeeCalculator.FEE_DENOMINATOR;
        const payerFeeMinor = (totalFeeMinor * MockFeeCalculator.PAYER_FEE_SHARE) / MockFeeCalculator.SHARE_DENOMINATOR;
        const payeeFeeMinor = (totalFeeMinor * MockFeeCalculator.PAYEE_FEE_SHARE) / MockFeeCalculator.SHARE_DENOMINATOR;
        const hubFeeMinor = totalFeeMinor - payerFeeMinor - payeeFeeMinor;

        const currency = amount.currency as unknown as Currency;

        const result = new FeeCalculationResult();
        result.transactionAmount = amount.amount;
        result.totalFeeAmount = FspiopMoney.deserialize(totalFeeMinor, scale);
        result.feeCurrency = currency;
        result.transactionCurrency = currency;
        result.feePolicy = MockFeeCalculator.createDummyFeePolicy(currency);
        result.feeSplits = {
            payer_fsp_fee: MockFeeCalculator.createSplit(payerFeeMinor, scale, currency),
            payee_fsp_fee: MockFeeCalculator.createSplit(payeeFeeMinor, scale, currency),
            hub_fee: MockFeeCalculator.createSplit(hubFeeMinor, scale, currency),
        };

        return result;
    }

    private static createSplit(
        amountMinor: bigint,
        scale: number,
        currency: Currency,
    ): FeeCalculationResult.FeeSplit {
        const split = new FeeCalculationResult.FeeSplit();
        split.amount = FspiopMoney.deserialize(amountMinor, scale);
        split.currency = currency;

        return split;
    }

    private static createDummyFeePolicy(currency: Currency): FeeCalculationResult.FeePolicy {
        const feePolicy = new FeeCalculationResult.FeePolicy();
        feePolicy.feePolicyId = '0';
        feePolicy.transactionCurrency = currency;

        return feePolicy;
    }
}
