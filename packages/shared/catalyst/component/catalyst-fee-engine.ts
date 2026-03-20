import {Currency, Extension, ExtensionList, FspiopCurrencies, FspiopMoney, Money} from '@shared/fspiop';
import {FeeSplitRole} from '../dto';
import {FeeCalculator} from './fee-calculator';
import {FeeValidator} from './fee-validator';

export enum EngineMode {
    Bypass = 'BYPASS',
    Strict = 'STRICT',
}

export class CatalystFeeEngine {

    private static readonly SCHEME_FEE_AMOUNT_KEY = 'scheme_fee_amount';
    private static readonly FEE_CURRENCY_KEY = 'scheme_fee_currency';
    private static readonly FEE_POLICY_ID_KEY = 'scheme_fee_policy_id';

    constructor(
        private readonly feeCalculator: FeeCalculator,
        private readonly engineMode: EngineMode = EngineMode.Strict,
    ) {
    }

    async execute(
        preCalculatedFees: Map<FeeSplitRole, Money>,
        scenario: string,
        amount: Money,
        feePolicyId: bigint,
    ): Promise<ExtensionList> {
        if (this.engineMode === EngineMode.Bypass) {
            return CatalystFeeEngine.toExtensionList(preCalculatedFees);
        }

        const feeCalculationResult = feePolicyId > 0n
            ? await this.feeCalculator.calculate(feePolicyId, amount)
            : await this.feeCalculator.calculate(scenario, amount);

        FeeValidator.validate(preCalculatedFees, feeCalculationResult);

        const resolvedFeePolicyId = feeCalculationResult.feePolicy?.feePolicyId
            ?? (feePolicyId > 0n ? feePolicyId.toString() : undefined);

        return CatalystFeeEngine.toExtensionList(
            preCalculatedFees,
            feeCalculationResult.feeSplits,
            feeCalculationResult.feeCurrency as Currency | undefined,
            resolvedFeePolicyId,
        );
    }

    private static toExtensionList(
        preCalculatedFees: Map<FeeSplitRole, Money>,
        calculatedFeeSplits?: { [key: string]: { amount?: string; }; },
        feeCurrency?: Currency,
        feePolicyId?: string,
    ): ExtensionList {
        const extensionList = new ExtensionList();
        const extensions = Array.from(preCalculatedFees.entries())
            .map(([role, money]) => CatalystFeeEngine.toExtension(role, money.amount));

        const preCalculatedFeeKeys = new Set(
            Array.from(preCalculatedFees.keys()).map((role) => CatalystFeeEngine.toExtensionKey(String(role))),
        );

        for (const [role, split] of Object.entries(calculatedFeeSplits ?? {})) {
            const amount = split.amount;

            if (amount == null) {
                continue;
            }

            extensions.push(CatalystFeeEngine.toCcExtension(role, amount));
        }

        const schemeFeeAmount = CatalystFeeEngine.toSchemeFeeAmount(
            preCalculatedFees,
            preCalculatedFeeKeys,
            calculatedFeeSplits,
            feeCurrency,
        );

        if (schemeFeeAmount != null) {
            extensions.push(CatalystFeeEngine.toSimpleExtension(CatalystFeeEngine.SCHEME_FEE_AMOUNT_KEY, schemeFeeAmount));
        }

        if (feeCurrency != null) {
            extensions.push(CatalystFeeEngine.toSimpleExtension(CatalystFeeEngine.FEE_CURRENCY_KEY, String(feeCurrency)));
        }

        const normalizedFeePolicyId = feePolicyId?.trim();
        if (normalizedFeePolicyId != null && normalizedFeePolicyId.length > 0) {
            extensions.push(CatalystFeeEngine.toSimpleExtension(CatalystFeeEngine.FEE_POLICY_ID_KEY, normalizedFeePolicyId));
        }

        extensionList.extension = extensions;

        return extensionList;
    }

    private static toExtension(role: FeeSplitRole, amount: string): Extension {
        const extension = new Extension();
        extension.key = CatalystFeeEngine.toExtensionKey(String(role));
        extension.value = amount;

        return extension;
    }

    private static toCcExtension(role: string, amount: string): Extension {
        const extension = new Extension();
        const extensionKey = CatalystFeeEngine.toExtensionKey(role);

        extension.key = extensionKey.endsWith('_cc')
            ? extensionKey
            : `${extensionKey}_cc`;
        extension.value = amount;

        return extension;
    }

    private static toSchemeFeeAmount(
        preCalculatedFees: Map<FeeSplitRole, Money>,
        preCalculatedFeeKeys: Set<string>,
        calculatedFeeSplits?: { [key: string]: { amount?: string; }; },
        feeCurrency?: Currency,
    ): string | undefined {
        const currency = feeCurrency ?? Array.from(preCalculatedFees.values())[0]?.currency;

        if (currency == null) {
            return undefined;
        }

        const scale = FspiopCurrencies.get(currency)?.scale;

        if (scale == null) {
            return undefined;
        }

        let total = 0n;

        for (const money of preCalculatedFees.values()) {
            total += FspiopMoney.serialize(money.amount, scale);
        }

        for (const [key, split] of Object.entries(calculatedFeeSplits ?? {})) {
            const amount = split.amount;

            if (amount == null) {
                continue;
            }

            const normalizedKey = CatalystFeeEngine.toExtensionKey(key);
            if (preCalculatedFeeKeys.has(normalizedKey)) {
                continue;
            }

            total += FspiopMoney.serialize(amount, scale);
        }

        return FspiopMoney.deserialize(total, scale);
    }

    private static toSimpleExtension(key: string, value: string): Extension {
        const extension = new Extension();
        extension.key = key;
        extension.value = value;

        return extension;
    }

    private static toExtensionKey(role: string): string {
        const normalizedRole = role.trim();

        if (
            normalizedRole === FeeSplitRole.Payer ||
            normalizedRole === 'payer_fsp' ||
            normalizedRole === 'payer_fsp_fee' ||
            normalizedRole === 'payer_fsp_fee_cc'
        ) {
            return 'payer_fsp_fee';
        }

        if (
            normalizedRole === FeeSplitRole.Payee ||
            normalizedRole === 'payee_fsp' ||
            normalizedRole === 'payee_fsp_fee' ||
            normalizedRole === 'payee_fsp_fee_cc'
        ) {
            return 'payee_fsp_fee';
        }

        if (
            normalizedRole === FeeSplitRole.Hub ||
            normalizedRole === 'hub' ||
            normalizedRole === 'hub_fee' ||
            normalizedRole === 'hub_fee_cc'
        ) {
            return 'hub_fee';
        }

        if (
            normalizedRole === FeeSplitRole.Si ||
            normalizedRole === 'si' ||
            normalizedRole === 'si_fee' ||
            normalizedRole === 'si_fee_cc'
        ) {
            return 'si_fee';
        }

        if (
            normalizedRole === FeeSplitRole.Fxp ||
            normalizedRole === 'fxp' ||
            normalizedRole === 'fxp_fee' ||
            normalizedRole === 'fxp_fee_cc'
        ) {
            return 'fxp_fee';
        }

        return normalizedRole.toLowerCase();
    }
}
