import {FspiopCurrencies, FspiopMoney, Money} from '@shared/fspiop';
import {FeeCalculationResult, FeeSplitRole} from '../dto';
import {CatalystException} from '../exception';

export class FeeValidator {

    private static readonly VALIDATION_MESSAGE = ' fee is not following the Fee Engine\'s calculation or policy.';

    static validate(
        preCalculatedFees: Map<FeeSplitRole, Money>,
        feeCalculationResult: FeeCalculationResult,
    ): void {

        if (feeCalculationResult.feePolicy == null) {
            return;
        }

        const calculatedSplits = feeCalculationResult.feeSplits ?? {};

        for (const [role, preCalculatedFee] of preCalculatedFees.entries()) {

            const calculatedSplit = FeeValidator.resolveSplit(calculatedSplits, role);

            if (calculatedSplit == null) {
                throw new CatalystException(`${role} fee cannot be resolved in current policy ID : ${feeCalculationResult.feePolicy?.feePolicyId}`);
            }

            if (preCalculatedFee.currency == null || calculatedSplit.currency == null) {
                throw new CatalystException(`Missing currency information for ${role}`);
            }

            if (String(preCalculatedFee.currency) !== String(calculatedSplit.currency)) {
                throw new CatalystException(`Currency information mismatch for ${role}`);
            }

            if (preCalculatedFee.amount == null || calculatedSplit.amount == null) {
                throw new CatalystException(`Missing amount for ${role}`);
            }

            const scale = FeeValidator.resolveScale(String(preCalculatedFee.currency), role);
            const preCalculatedAmount = FspiopMoney.serialize(preCalculatedFee.amount, scale);
            const calculatedAmount = FspiopMoney.serialize(calculatedSplit.amount, scale);

            if (preCalculatedAmount > calculatedAmount) {
                throw new CatalystException(`Pre-calculated fee is larger than the Fee Engine\'s calculation for ${role}`);
            }
        }
    }

    private static resolveScale(currency: string, role: FeeSplitRole): number {

        const currencyProfile = FspiopCurrencies.get(currency as any);

        if (currencyProfile == null) {
            throw new CatalystException(`Wrong currency information for ${role}`);
        }

        return currencyProfile.scale;
    }

    private static resolveSplit(
        feeSplits: { [key: string]: FeeCalculationResult.FeeSplit; },
        role: FeeSplitRole,
    ): FeeCalculationResult.FeeSplit | undefined {

        const direct = feeSplits[String(role)];

        if (direct != null) {
            return direct;
        }

        for (const key of FeeValidator.resolveRoleAliases(role)) {
            const match = feeSplits[key];
            if (match != null) {
                return match;
            }
        }

        return undefined;
    }

    private static resolveRoleAliases(role: FeeSplitRole): string[] {

        if (role === FeeSplitRole.Payer) {
            return ['payer_fsp', 'payer_fsp_fee', 'payer_fsp_fee_cc', 'PAYER_FSP'];
        }

        if (role === FeeSplitRole.Payee) {
            return ['payee_fsp', 'payee_fsp_fee', 'payee_fsp_fee_cc', 'PAYEE_FSP'];
        }

        if (role === FeeSplitRole.Hub) {
            return ['hub', 'hub_fee', 'HUB'];
        }

        if (role === FeeSplitRole.Si) {
            return ['si', 'SI'];
        }

        if (role === FeeSplitRole.Fxp) {
            return ['fxp', 'FXP'];
        }

        return [];
    }

    private static throwValidationError(role: FeeSplitRole): never {
        throw new CatalystException(`${role}${FeeValidator.VALIDATION_MESSAGE}`);
    }
}
